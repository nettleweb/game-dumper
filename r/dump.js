import fs from "fs";
import dns from "dns";
import url from "url";
import Path from "path";
import process from "process";
import puppeteer from "puppeteer";
import fetch from "node-fetch";

const baseDir = Path.dirname(Path.dirname(url.fileURLToPath(import.meta.url)));
const dataDir = Path.join(baseDir, "/local/data/");
const chromeDir = Path.join(baseDir, "/local/chrome/");

dns.setDefaultResultOrder("ipv4first");
dns.setServers(["1.1.1.1", "1.0.0.1"]);
dns.promises.setDefaultResultOrder("ipv4first");
dns.promises.setServers(["1.1.1.1", "1.0.0.1"]);

fs.mkdirSync(dataDir, { mode: 0o700, recursive: true });
fs.mkdirSync(chromeDir, { mode: 0o700, recursive: true });

const env = Object.setPrototypeOf(process.env, null);
env["LANG"] = "C.UTF-8";
env["LC_ALL"] = "C.UTF-8";
env["LANGUAGE"] = "C.UTF-8";
env["TERM"] = "";
env["NODE_TLS_REJECT_UNAUTHORIZED"] = "0";

const chrome = await puppeteer.launch({
	pipe: true,
	dumpio: true,
	timeout: 10000,
	product: "chrome",
	channel: "chrome",
	headless: false,
	userDataDir: dataDir,
	executablePath: Path.join(chromeDir, "chrome"),
	defaultViewport: {
		width: 1280,
		height: 720,
		isMobile: false,
		hasTouch: false,
		isLandscape: true,
		deviceScaleFactor: 1
	},
	args: [
		"--no-sandbox",
		"--no-first-run",
		"--disable-sync",
		"--disable-logging",
		"--disable-infobars",
		"--disable-translate",
		"--disable-extensions",
		"--disable-default-apps",
		"--disable-notifications",
		"--disable-dev-shm-usage",
		"--disable-web-security",
		"--disable-background-networking",
		"--window-size=1280,720",
		"--window-position=0,0"
	]
});

const hosts = await (async () => {
	const file = Path.join(baseDir, "/local/hosts.txt");
	if (fs.existsSync(file))
		return fs.readFileSync(file, "utf-8").split("\n");

	const hosts = [];
	const res = await fetch("https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts", {
		method: "GET",
		headers: {
			"Accept": "text/plain"
		}
	});

	if (res.ok && (res.headers.get("content-type") || "").split(";", 2)[0].trim() === "text/plain") {
		for (const line of (await res.text()).split("\n")) {
			if (line.startsWith("0.0.0.0 "))
				hosts.push(line.slice(8));
		}
		fs.writeFileSync(file, hosts.join("\n"), { encoding: "utf-8", mode: 0o600 });
	}

	return hosts;
})();

/**
 * @param {URL} url 
 * @returns {string}
 */
function getBaseURL(url) {
	const path = url.pathname;
	return url.origin + (path.endsWith("/") ? path : Path.dirname(path));
}

/**
 * @typedef {import("../types.d.ts").GameDumper} _
 * @param {string | URL} url 
 * @param {DumpOptions | nul} options 
 * @returns {Promise<DumpResults>}
 */
export default async function dump(url, options) {
	url = new URL(url);
	options ||= {};

	switch (url.protocol) {
		case "http:":
		case "https:":
			break;
		default:
			throw new Error("Unsupported URL protocol: " + url.protocol);
	}

	const origin = url.origin;
	const baseURI = getBaseURL(url);
	const crossOrigin = options.crossOrigin ?? true;
	const rewritePath = options.rewritePath ?? false;
	const awaitTime = Math.min(Math.max(options.awaitTime || 2500, 2000), 60000);

	/**
	 * @type {Record<string, Blob>}
	 */
	const resMap = Object.create(null);
	/**
	 * @type {Record<string, string>}
	 */
	const pathMap = Object.create(null);

	const page = await chrome.newPage();
	await page.setBypassCSP(true);
	await page.setCacheEnabled(false);
	await page.setJavaScriptEnabled(true);
	await page.setRequestInterception(true);
	await page.setBypassServiceWorker(true);
	await page.setGeolocation({
		accuracy: 0,
		latitude: 0,
		longitude: 0
	});
	await page.setUserAgent("Mozilla/5.0 ( ; ; rv:121.0) Gecko/20100101 Firefox/121.0", {
		architecture: "",
		bitness: "",
		brands: [],
		fullVersion: "",
		fullVersionList: [],
		mobile: false,
		model: "",
		platform: "",
		platformVersion: "",
		wow64: false
	});
	await page.setViewport({
		width: 1280,
		height: 720,
		isMobile: false,
		hasTouch: false,
		isLandscape: true,
		deviceScaleFactor: 1
	});

	page.setDefaultTimeout(10000);
	page.setDefaultNavigationTimeout(10000);

	page.on("request", async (req) => {
		const url = new URL(req.url());
		switch (url.protocol) {
			case "http:":
			case "https:":
				break;
			case "data:":
			case "blob:":
				await req.continue();
				return;
			default:
				await req.abort("accessdenied");
				return;
		}

		if (hosts.includes(url.hostname)) {
			// filter ads
			await req.abort("blockedbyclient");
			return;
		}

		if (req.method() !== "GET") {
			await req.continue();
			return;
		}

		const res = await fetch(url, {
			method: "GET",
			headers: req.headers(),
			referrer: origin,
			keepalive: false
		});
		const blob = await res.blob();
		const path = url.pathname;
		const href = url.origin + path; // opt out search and hash

		if (res.ok && (crossOrigin || url.origin === origin) && !(href in pathMap)) {
			if (rewritePath) {
				const resID = "r/" + Math.floor(Math.random() * 1000000000000000) + Path.extname(path);
				pathMap[href] = resID;
				resMap[resID] = blob;
			} else {
				if (href.startsWith(baseURI)) {
					const path = href.slice(baseURI.length);
					pathMap[href] = path;
					resMap[path] = blob;
				} else {
					const nPath = "ext/" + url.hostname + path;
					pathMap[href] = nPath;
					resMap[nPath] = blob;
				}
			}
		}

		const headers = Object.create(null);
		for (const [k, v] of res.headers)
			headers[k] = v;

		headers["content-type"] = blob.type;
		headers["content-size"] = blob.size;

		await req.respond({
			body: Buffer.from(await blob.arrayBuffer(), 0, blob.size),
			status: res.status,
			headers: headers,
			contentType: blob.type,
		});
	});

	const res = await page.goto(url.href, {
		referer: "",
		timeout: 10000,
		waitUntil: "domcontentloaded"
	});

	if (res == null)
		throw new Error("Failed to load requested page.");
	if (!res.ok())
		throw new Error("Response returned error status code: " + res.status());

	// wait for all resources to be loaded
	await new Promise((r) => setTimeout(r, awaitTime));

	await page.evaluate("\"use strict\";window[\"_230_options\"]=" + JSON.stringify({
		html: (await res.buffer()).toString("utf-8"),
		map: pathMap,
		cors: crossOrigin,
		origin: origin,
		baseURI: baseURI
	}, void 0, 0));

	await page.evaluate(fs.readFileSync(Path.join(baseDir, "/r/rewrite.js"), "utf-8"));
	await new Promise((r) => setTimeout(r, 3000));
	resMap["/index.html"] = new Blob([Buffer.from(await page.evaluate("\"use strict\";(()=>window._230_res_html)();"))], { type: "text/html", endings: "native" });
	await page.close({ runBeforeUnload: false });
	return resMap;
}
