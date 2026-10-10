from __future__ import annotations

import hashlib
import json
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass

import psycopg


@dataclass(frozen=True)
class Rename:
    object_id: str
    expected_version: int
    title: str


class ContractError(Exception):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def digest(req: Rename) -> str:
    raw = json.dumps(req.__dict__, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(raw).hexdigest()


def rename(conninfo: str, actor_id: str, req: Rename, key: str, *,
           entered: threading.Event | None = None) -> dict:
    payload_hash = digest(req)
    with psycopg.connect(conninfo) as conn:
        with conn.transaction():
            # Serialize all reuse decisions for this scoped key, including the
            # absent-row case.  A row lock alone is insufficient: two requests
            # can both observe no row and race on the unique index.
            scope = f"rename:{actor_id}:{key}"
            conn.execute(
                "SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))", (scope,)
            )
            row = conn.execute(
                """SELECT response, payload_hash, expires_at FROM idempotency_journal
                   WHERE actor_id=%s AND operation='rename' AND idempotency_key=%s
                   FOR UPDATE""", (actor_id, key)).fetchone()
            if row:
                if row[2] <= conn.execute("SELECT now()").fetchone()[0]:
                    conn.execute(
                        """DELETE FROM idempotency_journal
                           WHERE actor_id=%s AND operation='rename' AND idempotency_key=%s""",
                        (actor_id, key),
                    )
                else:
                    if row[1] != payload_hash:
                        raise ContractError("idempotency_key_reuse")
                    return row[0]

            # The event makes the two independent transactions overlap before CAS.
            if entered:
                entered.set()
                time.sleep(0.15)
            row = conn.execute(
                """UPDATE cards
                   SET title=%s, version=version+1
                   WHERE id=%s AND owner_id=%s AND version=%s
                   RETURNING id, version, title""",
                (req.title, req.object_id, actor_id, req.expected_version),
            ).fetchone()
            if row is None:
                raise ContractError("conflict")
            response = {"id": row[0], "version": row[1], "title": row[2]}
            conn.execute(
                """INSERT INTO idempotency_journal
                   (actor_id, operation, idempotency_key, payload_hash, response, expires_at)
                   VALUES (%s, 'rename', %s, %s, %s, now() + interval '1 hour')""",
                (actor_id, key, payload_hash, json.dumps(response)),
            )
            return response


def main() -> None:
    dsn = os.environ.get("DATABASE_URL", "postgresql://mcp_test:mcp_test@127.0.0.1:55432/mcp_test")
    with psycopg.connect(dsn, autocommit=True) as conn:
        conn.execute("""CREATE TABLE IF NOT EXISTS cards (
            id text PRIMARY KEY, owner_id text NOT NULL, version integer NOT NULL,
            title text NOT NULL)""")
        conn.execute("""CREATE TABLE IF NOT EXISTS idempotency_journal (
            actor_id text NOT NULL, operation text NOT NULL, idempotency_key text NOT NULL,
            payload_hash text NOT NULL, response jsonb NOT NULL, expires_at timestamptz NOT NULL,
            PRIMARY KEY (actor_id, operation, idempotency_key))""")
        conn.execute("TRUNCATE cards, idempotency_journal")
        conn.execute("INSERT INTO cards VALUES ('c1', 'alice', 7, 'Draft')")

    barrier = threading.Event()
    req = Rename("c1", 7, "Winner")
    def call(index):
        try:
            return ("accepted", rename(dsn, "alice", req, f"race-key-{index}", entered=barrier))
        except ContractError as e:
            return (e.code, None)
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = {
            index: pool.submit(call, index) for index in range(2)
        }
        assert barrier.wait(5), "workers did not overlap"
        results = {index: future.result() for index, future in futures.items()}
    assert sorted(x[0] for x in results.values()) == ["accepted", "conflict"], results

    # Replay the key that actually won the CAS race.  Never assume worker 0
    # wins: either worker can be scheduled first.  Also assert the other
    # possible key was not accidentally journaled.
    accepted_keys = [
        f"race-key-{index}" for index, result in results.items()
        if result[0] == "accepted"
    ]
    assert len(accepted_keys) == 1, results
    winner_key = accepted_keys[0]
    replay = rename(dsn, "alice", req, winner_key)
    assert replay == {"id": "c1", "version": 8, "title": "Winner"}
    loser_key = "race-key-1" if winner_key == "race-key-0" else "race-key-0"
    try:
        rename(dsn, "alice", req, loser_key)
    except ContractError as e:
        assert e.code == "conflict"
    else:
        raise AssertionError("losing race key must not replay")
    try:
        rename(dsn, "alice", Rename("c1", 8, "Other"), winner_key)
    except ContractError as e:
        assert e.code == "idempotency_key_reuse"
    else:
        raise AssertionError("payload reuse must fail")

    # TTL boundary: an expired row is replaced atomically, not left to cause
    # a unique-key error.  The replacement also has a real side effect.
    expired = Rename("c1", 8, "After TTL")
    with psycopg.connect(dsn) as conn:
        conn.execute(
            """INSERT INTO idempotency_journal
               VALUES ('alice', 'rename', 'expired-key', %s, %s, now() - interval '1 second')""",
            (digest(Rename("c1", 8, "Old")), json.dumps({"id": "c1", "version": 8, "title": "Old"})),
        )
    assert rename(dsn, "alice", expired, "expired-key") == {
        "id": "c1", "version": 9, "title": "After TTL"
    }
    with psycopg.connect(dsn) as conn:
        assert conn.execute(
            "SELECT count(*) FROM idempotency_journal WHERE idempotency_key='expired-key'"
        ).fetchone()[0] == 1

    # Concurrent reuse of an expired key: same payload replays once; a
    # different payload is rejected after the first transaction wins.
    same_req = Rename("c1", 9, "After TTL again")
    with psycopg.connect(dsn) as conn:
        conn.execute("UPDATE cards SET version=9, title='After TTL' WHERE id='c1'")
        conn.execute(
            "UPDATE idempotency_journal SET payload_hash=%s, expires_at=now() - interval '1 second' "
            "WHERE idempotency_key='expired-key'",
            (digest(same_req),),
        )
    with ThreadPoolExecutor(max_workers=2) as pool:
        same_results = [
            f.result() for f in [
                pool.submit(rename, dsn, "alice", same_req, "expired-key")
                for _ in range(2)
            ]
        ]
    assert same_results == [same_results[0], same_results[0]]
    with psycopg.connect(dsn) as conn:
        assert conn.execute("SELECT version, title FROM cards WHERE id='c1'").fetchone() == (10, "After TTL again")

    with psycopg.connect(dsn) as conn:
        conn.execute("UPDATE idempotency_journal SET expires_at=now() - interval '1 second' WHERE idempotency_key='expired-key'")
    different = Rename("c1", 10, "Different")
    outcomes = []
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [
            pool.submit(rename, dsn, "alice", req_arg, "expired-key")
            for req_arg in (different, Rename("c1", 10, "Another"))
        ]
        for future in futures:
            try:
                outcomes.append(("accepted", future.result()))
            except ContractError as e:
                outcomes.append((e.code, None))
    assert sorted(item[0] for item in outcomes) == ["accepted", "idempotency_key_reuse"]
    with psycopg.connect(dsn) as conn:
        assert conn.execute("SELECT version FROM cards WHERE id='c1'").fetchone()[0] == 11

    with psycopg.connect(dsn) as conn:
        conn.execute("UPDATE cards SET owner_id='alice', version=8, title='Winner' WHERE id='c1'")
        before = conn.execute("SELECT version, title FROM cards").fetchone()
    try:
        rename(dsn, "bob", Rename("c1", 8, "Nope"), "unauthorized-key")
    except ContractError as e:
        assert e.code == "conflict"
    else:
        raise AssertionError("unauthorized actor must fail")
    with psycopg.connect(dsn) as conn:
        after = conn.execute("SELECT version, title FROM cards").fetchone()
        journal = conn.execute("SELECT count(*) FROM idempotency_journal WHERE idempotency_key='unauthorized-key'").fetchone()[0]
    assert after == before and journal == 0
    print("PASS: race accepted=1 conflict=1 version=8; replay; key-reuse reject; unauthorized rollback")


if __name__ == "__main__":
    main()
