#!/bin/env node
import fs, { existsSync } from "fs";
import Path from "path";
import process from "process";

const [node, js, ...args] = process.argv;
const { stdin, stdout, stderr } = process;

stdin.setEncoding("utf-8");
stdin.setDefaultEncoding("utf-8");
stdout.setEncoding("utf-8");
stdout.setDefaultEncoding("utf-8");
stderr.setEncoding("utf-8");
stderr.setDefaultEncoding("utf-8");

const VERSION = "0.1.0";
const INFO = "WhiteSpider Game Dumper version " + VERSION + " by WhiteSpider Dev\nGitHub Project: https://github.com/whitespider-dev/whitespider\n\n";

let url;
let out = "./out/";
let cors = true;
let rpath = false;
let parse = 0;

for (const arg of args) {
	if (arg[0] === "-") {
		const op = arg[1] === "-" ? arg.slice(2) : arg.slice(1);
		switch (op) {
			case "help":
				stdout.write(INFO);
				stdout.write("Usage: dump.js [OPTION...] <URL>\n\n"); // STUB
				stdout.write("\t-o, --out <dir>		Specify the output directory.\n");
				stdout.write("\t-r, --rewrite-path	Preserve resource pathname.\n");
				stdout.write("\t-s, --same-origin	Filter cross-origin resources.\n");
				stdout.write("\t--help			Show this help message and exit.\n");
				stdout.write("\t--version		Show version information and exit.\n\n");
				process.exit(0);
				break;
			case "version":
				stdout.write(VERSION + "\n");
				process.exit(0);
				break;
			case "o":
			case "out":
				parse = 1;
				break;
			case "r":
			case "rewrite-path":
				rpath = true;
				break;
			case "s":
			case "same-origin":
				cors = false;
				break;
			default:
				stdout.write("Error: Invalid option: -" + op + "\n");
				stdout.write("Try '--help' for more information.\n");
				process.exit(1);
				break;
		}
		continue;
	}

	if (parse === 1) {
		out = arg;
		continue;
	}

	url = arg;
}

if (typeof url === "undefined") {
	stdout.write("Error: No URL specified.\n");
	stdout.write("Try '--help' for more information.\n");
	process.exit(1);
}

try {
	url = new URL(url);
	switch (url.protocol) {
		case "http:":
		case "https:":
			break;
		default:
			stdout.write("Error: URL protocol must be 'http:' or https:'.\n");
			process.exit(1);
			break;
	}
	url = url.href;
} catch (err) {
	stdout.write("Error: Invalid URL: " + url + "\n");
	process.exit(1);
}

if (fs.existsSync(out = Path.resolve(out)))
	fs.rmSync(out, { force: true, recursive: true });
fs.mkdirSync(out, { mode: 0o700, recursive: true });

stdout.write(INFO);
await new Promise(r => setTimeout(r, 500));
stdout.write("Starting browser...\n\n");

let _dump_;

try {
	_dump_ = (await import("./dump.js")).default;
} catch (err) {
	stderr.write("Error: Failed to start browser:\n\t");
	stderr.write(String(err) + "\n");
	process.exit(1);
}

for (const k of Object.keys(_dump_ = await _dump_(url, { rewritePath: rpath, crossOrigin: cors, awaitTime: 10000 }))) {
	const blob = _dump_[k];
	const file = Path.join(out, k);

	if (!fs.existsSync(file)) {
		fs.mkdirSync(Path.dirname(file), { mode: 0o700, recursive: true });
		fs.writeFileSync(file, Buffer.from(await blob.arrayBuffer(), 0, blob.size), { mode: 0o600 });
	}
}

process.exit(0);
