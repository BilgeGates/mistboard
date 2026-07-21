# ElephantChess mining on Modal

Modal supplies scale-to-zero CPU workers. Railway Postgres remains the source
of truth for the frozen manifest, shard leases, checkpoints, candidates, and
judgments. No Modal Volume is required.

## One-time setup

1. Install and authenticate the Modal CLI.
2. Create a Modal Secret named `mistboard-mining-production-db` with one key,
   `DATABASE_URL`. Use a least-privilege, TLS-enabled Railway public Postgres
   connection. Do not use Railway's private hostname from Modal.
3. Keep the pinned Pikafish 2026-01-02 release at
   `../tools/pikafish-official-2026-01-02`, relative to this repository, or set
   `MISTBOARD_MODAL_PIKAFISH_DIR` to that release directory.
4. Set `MISTBOARD_MODAL_MANIFEST_PATH` to the private frozen manifest. The
   manifest is sent as a function input and is not committed into the image.

The launcher verifies the local Linux executable and NNUE hashes before Modal
builds an image. The remote initializer repeats those checks and the UCI
identity check inside Linux.

## Safe launch sequence

Run an artifact-only smoke first. It does not attach the database secret or
write production state:

```sh
modal run scripts/modal/elephantchess_pilot.py::verify
```

After migration 110 is deployed, explicitly initialize the Linux execution:

```sh
modal run scripts/modal/elephantchess_pilot.py::initialize
```

Copy the returned `runId`, inspect it, and run one 25-game canary:

```sh
modal run scripts/modal/elephantchess_pilot.py::status --run-id RUN_ID
modal run scripts/modal/elephantchess_pilot.py::scan --run-id RUN_ID --tasks 1
modal run scripts/modal/elephantchess_pilot.py::status --run-id RUN_ID
```

If the canary is healthy, submit the remaining shard inputs. The function caps
execution at four one-core containers, regardless of the number of inputs:

```sh
modal run scripts/modal/elephantchess_pilot.py::scan --run-id RUN_ID --tasks 40
```

Extra inputs safely return without work. After scanning reaches `verifying`, use
the status output's verified-candidate count to size the independent audit map:

```sh
modal run scripts/modal/elephantchess_pilot.py::audit --run-id RUN_ID --tasks CANDIDATE_COUNT
```

To stop, cancel the running Modal App. Database leases expire after 30 minutes;
rerunning the same command then reclaims interrupted shards or candidates from
their last durable checkpoint. Never delete the run to recover work.
