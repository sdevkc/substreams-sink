# [`Substreams`](https://substreams.streamingfast.io/) Sink CLI `Node.js`

[![Build Status](https://github.com/pinax-network/substreams-sink/actions/workflows/ci.yml/badge.svg)](https://github.com/pinax-network/substreams-sink/actions/workflows/ci.yml)
[![npm version](https://badge.fury.io/js/substreams-sink.svg)](https://badge.fury.io/js/substreams-sink)
![License](https://img.shields.io/github/license/pinax-network/substreams-sink)

> `substreams-sink` is the code template to build Substreams sinks in NodeJS. Sinks allows developers to pipe data extracted from a blockchain to a specified application.

## 📖 Documentation

<!-- ### https://www.npmjs.com/package/substreams-sink -->

### Further resources

- [**Substreams** documentation](https://substreams.streamingfast.io)

## 🚀 Quick start

### Installation

```bash
npm install substreams-sink
```

### Features

- [x] includes [Commander.js](https://github.com/tj/commander.js/) helper CLI
- [x] includes [tslog](https://github.com/fullstack-build/tslog) helper logger
- [x] includes **Substreams** `init()` and `start()` helper methods & `RunOptions` interface
- [x] handle reading/saving **Substreams** `cursor.lock` file
- [x] reads `SUBSTREAMS_API_TOKEN` from `.env` file
- [x] includes `--verbose` flag
- [x] includes `--production-mode` flag
- [x] includes `--auto-restart` flag
- [x] Prometheus metrics

### CLI

```bash
Usage: substreams-sink run [options]

Substreams Sink

Options:
  -e --substreams-endpoint <string>       Substreams gRPC endpoint to stream data from
  --manifest <string>                     URL of Substreams package
  --module_name                           Name of the output module (declared in the manifest)
  -s --start-block <int>                  Start block to stream from (defaults to -1, which
                                          means the initialBlock of the first module you are
                                          streaming)
  -t --stop-block <int>                   Stop block to end stream at, inclusively
  -p, --params <string...>                Set a params for parameterizable modules. Can be
                                          specified multiple times. (ex: -p module1=valA -p
                                          module2=valX&valY)
  --substreams-api-token <string>         API token for the substream endpoint
  --substreams-api-token-envvar <string>  Environnement variable name of the API token for the
                                          substream endpoint (ex: SUBSTREAMS_API_TOKEN)
  --delay-before-start <int>              [OPERATOR] Amount of time in milliseconds (ms) to wait
                                          before starting any internal processes, can be used to
                                          perform to maintenance on the pod before actually
                                          letting it starts
  --cursor-file <string>                  cursor lock file (ex: cursor.lock)
  --disable-production-mode               Disable production mode, allows debugging modules
                                          logs, stops high-speed parallel processing
  --verbose                               Enable verbose logging
  --restart-inactivity-seconds            If set, the sink will restart when inactive for over a
                                          certain amount of seconds (ex: 60)
  -h, --help                              display help for command
```

### Example

```js
import pkg from "./package.json" assert { type: "json" };
import { createRegistry, createRequest, fetchSubstream } from "@substreams/core";
import { BlockEmitter, createDefaultTransport } from "@substreams/node";
import { prometheus, logger, commander, cursor, config } from "@substreams/sink";

// Setup CLI using Commander
const program = commander.program(pkg);
const command = commander.run(program, pkg);

command.action(async (options: commander.RunOptions) => {
  // auth API token
  // https://app.streamingfast.io/
  const token = config.getToken(options);
  const baseUrl = config.getBaseUrl(options);

  // User parameters
  const manifest = config.getManifest(options);
  const outputModule = config.getModuleName(options);
  const startBlockNum = config.getStartBlock(options);
  const stopBlockNum = config.getStopBlock(options);
  const cursorFile = config.getCursorFile(options);
  const verbose = config.getVerbose(options);

  // Configure logging with TSLog
  logger.setName(pkg.name);
  if ( verbose ) logger.enable();

  // Read Substream
  const substreamPackage = await fetchSubstream(manifest);

  // Connect Transport
  const registry = createRegistry(substreamPackage);
  const transport = createDefaultTransport(baseUrl, token, registry);
  const request = createRequest({
    substreamPackage,
    outputModule,
    startBlockNum,
    stopBlockNum,
    productionMode: true,
    startCursor: cursor.readCursor(cursorFile),
  });

  // Substreams Block Emitter
  const emitter = new BlockEmitter(transport, request, registry);

  // Stream Blocks
  emitter.on("anyMessage", (message, cursor, clock) => {
    logger.info(message);
    logger.info(cursor);
    logger.info(clock);
  });
  // Handle Prometheus Metrics
  prometheus.onPrometheusMetrics(emitter);

  // Save new cursor on each new block emitted
  cursor.onCursor(emitter, cursorFile);

  // Start streaming
  emitter.start();
})

program.parse();
```
