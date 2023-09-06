import type { BlockScopedData, SessionInit, Clock } from "@substreams/core/proto";
import type { BlockEmitter } from "@substreams/node";
import client, { Counter, Gauge, Summary, Histogram, type CounterConfiguration, type GaugeConfiguration, type SummaryConfiguration, type HistogramConfiguration } from "prom-client";

import { logger } from "./logger.js";
import type { RunOptions } from "./commander.js";

// Prometheus Exporter
export const registry = new client.Registry();
export { client };

// Metrics
export function registerCounter(name: string, help = "help", labelNames: string[] = [], config?: CounterConfiguration<string>): Counter | undefined {
    try {
        registry.registerMetric(new Counter({ name, help, labelNames, ...config }));
        return registry.getSingleMetric(name) as Counter;
    } catch (e) {
        logger.error(e);
    }
}

export function registerGauge(name: string, help = "help", labelNames: string[] = [], config?: GaugeConfiguration<string>): Gauge | undefined {
    try {
        registry.registerMetric(new Gauge({ name, help, labelNames, ...config }));
        return registry.getSingleMetric(name) as Gauge;
    } catch (e) {
        logger.error(e);
    }
}

export function registerSummary(name: string, help = "help", labelNames: string[] = [], config?: SummaryConfiguration<string>): Summary | undefined {
    try {
        registry.registerMetric(new Summary({ name, help, labelNames, ...config }));
        return registry.getSingleMetric(name) as Summary;
    } catch (e) {
        logger.error(e);
    }
}

export function registerHistogram(name: string, help = "help", labelNames: string[] = [], config?: HistogramConfiguration<string>): Histogram | undefined {
    try {
        registry.registerMetric(new Histogram({ name, help, labelNames, ...config }));
        return registry.getSingleMetric(name) as Histogram;
    } catch (e) {
        logger.error(e);
    }
}

// Counters
const substreams_sink_message_size_bytes = registerCounter("substreams_sink_message_size_bytes", "The number of total bytes of message received from the Substreams backend");
const substreams_sink_error = registerCounter("substreams_sink_error", "The error count we encountered when interacting with Substreams for which we had to restart the connection loop");
const substreams_sink_data_message = registerCounter("substreams_sink_data_message", "The number of data message received");
const substreams_sink_data_message_size_bytes = registerCounter("substreams_sink_data_message_size_bytes", "The total size of in bytes of all data message received");
const substreams_sink_undo_message = registerCounter("substreams_sink_undo_message", "The number of block undo message received");
const substreams_sink_unknown_message = registerCounter("substreams_sink_unknown_message", "The number of unknown message received");
const substreams_sink_progress_message = registerCounter("substreams_sink_progress_message", "The number of progress message received", ["module"]);

// Gauges
const trace_id = registerGauge("trace_id", "Substreams session trace id", ["trace_id"]);
const head_block_number = registerGauge("head_block_number", "Last processed block number");
const head_block_time_drift = registerGauge("head_block_time_drift", "Head block time drift in seconds");
const head_block_timestamp = registerGauge("head_block_timestamp", "Head block timestamp");
const substreams_sink_backprocessing_completion = registerGauge("substreams_sink_backprocessing_completion", "Determines if backprocessing is completed, which is if we receive a first data message");
const substreams_sink_progress_message_last_end_block = registerGauge("substreams_sink_progress_message_last_end_block", "Latest progress reported processed range end block for each module, usually increments but due scheduling could make that fluctuates up/down", ["module"]);

function calculateHeadBlockTimeDrift(clock: Clock) {
    const seconds = Number(clock.timestamp?.seconds);
    return Math.round((new Date().valueOf() / 1000) - seconds);
}

function updateClockMetrics(clock: Clock) {
    head_block_number?.set(Number(clock.number));
    head_block_time_drift?.set(calculateHeadBlockTimeDrift(clock));
    head_block_timestamp?.set(Number(clock.timestamp?.seconds));
}

function updateBlockDataMetrics(block: BlockScopedData) {
    substreams_sink_data_message?.inc(1);
    substreams_sink_data_message_size_bytes?.inc(block.toBinary().byteLength);
    substreams_sink_backprocessing_completion?.set(1);
}

export function updateSessionMetrics(session: SessionInit) {
    logger.info("trace_id", session.traceId);
    trace_id?.labels({ trace_id: session.traceId }).set(1);
}

export function onPrometheusMetrics(emitter: BlockEmitter) {
    emitter.on("undo", () => substreams_sink_undo_message?.inc(1));
    emitter.on("session", session => updateSessionMetrics(session));
    emitter.on("block", block => {
        updateBlockDataMetrics(block);
        if (block.clock) updateClockMetrics(block.clock);
    });
}

export function handleManifest(emitter: BlockEmitter, moduleHash: string, options: RunOptions) {
    logger.info("manifest", { moduleHash, manifest: options.manifest, substreamsEndpoint: options.substreamsEndpoint });
    const labelNames = ["moduleHash", "manifest", "outputModule", "substreamsEndpoint", "startBlockNum", "stopBlockNum", "productionMode"];
    registerGauge("manifest", "Substreams manifest and sha256 hash of map module", labelNames);
    const gauge = registry.getSingleMetric("manifest") as Gauge;
    gauge.labels({
        moduleHash,
        manifest: options.manifest,
        outputModule: emitter.request.outputModule,
        substreamsEndpoint: options.substreamsEndpoint,
        startBlockNum: String(emitter.request.startBlockNum),
        stopBlockNum: String(emitter.request.stopBlockNum),
        productionMode: String(emitter.request.productionMode)
    }).set(1);
}
