import { parentPort, workerData } from 'node:worker_threads';
import { simulateScenario } from './simulation.js';

const result = simulateScenario(workerData);
parentPort?.postMessage(result);
