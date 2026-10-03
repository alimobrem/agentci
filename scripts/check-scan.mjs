import { readFile } from 'node:fs/promises';
const report = JSON.parse(await readFile(process.argv[2], 'utf8'));
if (!Array.isArray(report.Results) || !report.Results.length) throw new Error('Missing scan inventory');
const blocking = report.Results.flatMap(result => result.Vulnerabilities ?? []).filter(v => ['HIGH','CRITICAL'].includes(v.Severity) && v.FixedVersion);
if (blocking.length) { console.error(`${blocking.length} fixable high/critical findings block CI`); process.exitCode = 1; }
else console.log('No fixable high/critical findings. Full scan and applicability assessment remain release gates.');
