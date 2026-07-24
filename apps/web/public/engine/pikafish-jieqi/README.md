# PikaJieQi WebAssembly

Browser build of Pikafish's classical-evaluation `jieqi_old` branch for Reveal
Xiangqi review analysis.

- Upstream source: `official-pikafish/Pikafish`
- Upstream commit: `23b9466c981f0f3a1133f92de1a6f86406c4eccc`
- Build toolchain: `emscripten/emsdk:3.1.74`
- License: GPL-3.0-or-later (`COPYING.txt`)
- Network: none; this build uses the branch's handcrafted evaluation

The build exposes a persistent `pikajieqi_command(const char*)` UCI entry point.
`worker.js` hosts the module and forwards streaming UCI output to the web client.
The generated module uses pthreads and therefore requires a cross-origin-isolated
document.

## Rebuild

`pikajieqi-source-23b9466.tar.gz` is the complete corresponding source used for
the distributed binary. Extract it and run:

```sh
docker run --rm -v "$PWD:/src" -w /src emscripten/emsdk:3.1.74 \
  bash wasm/build.sh
```

For a smaller audit trail, the same source is reproducible from the exact
upstream commit plus the adjacent `source.patch`:

```sh
git clone https://github.com/official-pikafish/Pikafish.git
cd Pikafish
git checkout 23b9466c981f0f3a1133f92de1a6f86406c4eccc
git apply /path/to/source.patch
mkdir -p wasm
cp /path/to/build.sh wasm/build.sh
docker run --rm -v "$PWD:/src" -w /src emscripten/emsdk:3.1.74 \
  bash wasm/build.sh
```

Keep this README, the source archive, `source.patch`, `build.sh`, and
`COPYING.txt` alongside any distributed binary build.
