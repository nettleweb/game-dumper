/// <reference lib="dom" />
/// <reference lib="dom.Iterable" />
"use strict"; (async () => {
	/**
	 * @typedef {{
	 * readonly html: string;
	 * readonly map: Record<string, string>;
	 * readonly cors: boolean;
	 * readonly origin: string;
	 * readonly baseURI: string;
	 * }} Options
	 * @type {Options} 
	 */
	const options = window["_230_options"];
	if (typeof options === "undefined")
		throw new Error("Required properties not specified.");

	const { html, map, cors, origin, baseURI } = options;
	const document = new DOMParser().parseFromString(html, "text/html");

	/**
	 * @param {Element} elem 
	 */
	function rewriteMediaElement(elem) {
		const src = elem.getAttribute("src") || (elem.getAttribute("srcset") || "").split(",", 2)[0].split(" ", 2)[0].trim();
		elem.removeAttribute("src");
		elem.removeAttribute("srcset");

		if (src.length > 0) {
			const url = new URL(src, baseURI);
			if (cors || url.origin === origin) {
				switch (url.protocol) {
					case "http:":
					case "https:":
						const nsrc = map[url.origin + url.pathname] || "";
						if (nsrc.length > 0)
							elem.setAttribute("src", nsrc);
						else
							elem.remove();
						return;
					case "data:":
						elem.setAttribute("src", url.href);
						return;
					default:
						break;
				}
			}
		}

		elem.remove();
	}

	/**
	 * @param {Element} elem 
	 */
	async function rewriteLinkElement(elem) {
		const rel = elem.getAttribute("rel") || "";
		const href = elem.getAttribute("href") || "";

		if (rel.length > 0 && href.length > 0) {
			for (const it of rel.trim().split(" ")) {
				if (it === "stylesheet") {
					const css = await fetchCSS(new URL(href, baseURI));
					if (css == null)
						throw new Error("Failed to fetch stylesheet");

					const style = document.createElement("style");
					style.type = "text/css";
					style.textContent = await rewriteCSS(css || " ");
					elem.replaceWith(style);
					return;
				}
			}
		}
		elem.remove();
	}

	/**
	 * @param {Element} elem 
	 */
	function rewriteScriptElement(elem) {
		const type = elem.getAttribute("type") || "";
		const src = elem.getAttribute("src") || "";

		// switch (type) {
		// 	case "module":
		// 	case "importmap":
		// 		// rewrite for module script is not implemented
		// 		elem.remove();
		// 		return;
		// 	default:
		// 		break;
		// }

		if (src.length > 0) {
			const url = new URL(src, baseURI);
			if (cors || url.origin === origin) {
				switch (url.protocol) {
					case "http:":
					case "https:":
						const nsrc = map[url.origin + url.pathname] || ""; // ignore search and hash
						if (nsrc.length > 0)
							elem.setAttribute("src", nsrc)
						else
							elem.remove();
						return;
					case "data:":
						elem.setAttribute("src", url.href);
						return;
					default:
						break;
				}
			}
		}

		elem.remove();
	}

	/**
	 * @param {string | URL} url 
	 * @returns {Promise<string | null>} 
	 */
	async function fetchCSS(url) {
		try {
			const res = await window.fetch(url, {
				cache: "no-cache",
				method: "GET",
				headers: {
					"Accept": "text/css"
				}
			});

			if (!res.ok)
				return null;
			if ((res.headers.get("content-type") || "").split(";", 2)[0].trim() !== "text/css")
				return null;

			return await res.text();
		} catch (err) {
			return null;
		}
	}

	/**
	 * @param {string} css 
	 * @returns {Promise<string>}
	 */
	async function rewriteCSS(css) {
		const style = document.createElement("style");
		style.textContent = css;
		document.body.appendChild(style);
		css = await rewriteCSSStyleSheet(style.sheet);
		style.remove();
		return css;
	}

	/**
	 * @param {CSSStyleSheet} sheet 
	 */
	async function rewriteCSSStyleSheet(sheet) {
		const texts = [];
		const rules = sheet.cssRules;

		for (let i = 0; i < rules.length; i++) {
			const rule = rules[i];

			if (rule instanceof CSSImportRule) {
				sheet.deleteRule(i);

				// import css manually
				const url = new URL(rule.href, baseURI).href;
				const css = await fetchCSS(url);
				if (css == null)
					throw new Error("Failed to fetch stylesheet");
				texts.push(await rewriteCSS(css));
			} else {
				if ("style" in rule) {
					// CSSStyleRule, CSSFontFaceRule, CSSKeyframeRule, 
					await rewriteCSSStyleDeclaration(rule.style);
				}
				if ("cssRules" in rule && "deleteRule" in rule) {
					// CSSGroupingRule, CSSKeyframesRule
					await rewriteCSSStyleSheet(rule);
				}
				texts.push(rule.cssText);
			}
		}

		return texts.join("\n");
	}

	/**
	 * @param {CSSStyleDeclaration} declaration 
	 */
	async function rewriteCSSStyleDeclaration(declaration) {
		for (const key of declaration) {
			const value = declaration.getPropertyValue(key);
			const urlDecl = (value.match(/url\((["'])(.*?[^\\])\1\)/))?.[0];
			if (urlDecl != null) {
				const url = urlDecl.substring(5, urlDecl.length - 2);
				declaration.setProperty(key, value.replace(url, await rewriteCSSResourceURL(url)));
			}
		}
	}

	async function rewriteCSSResourceURL(url) {
		if (url.length > 0) {
			url = new URL(url, baseURI);
			switch (url.protocol) {
				case "http:":
				case "https:":
					return map[url.origin + url.pathname] || "";
				case "data:":
					return url.href;
				default:
					break;
			}
		}
		return "";
	}

	for (const elem of document.querySelectorAll("*")) {
		switch (elem.tagName.toLowerCase()) {
			case "img":
			case "audio":
			case "video":
			case "input":
			case "track":
			case "image":
			case "source":
				rewriteMediaElement(elem);
				break;
			case "base":
			case "meta":
				elem.remove();
				break;
			case "title":
				document.title = (elem.textContent || "Page") + " (Generated by Game Dumper)";
				break;
			case "embed":
			case "object":
			case "frame":
			case "iframe":
				elem.remove(); // Function not implemented
				break;
			case "link":
				await rewriteLinkElement(elem);
				break;
			case "style":
				const css = elem.textContent || "";
				if (css.length > 0)
					elem.textContent = await rewriteCSS(css);
				else
					elem.remove();
				break;
			case "script":
				rewriteScriptElement(elem);
				break;
			default:
				break;
		}

		const style = elem.getAttribute("style");
		if (style != null && style.length > 0) {
			await rewriteCSSStyleDeclaration(elem.style);
		}
	}

	if (document.title === "")
		document.title = "Page (Generated by Game Dumper)"

	Object.defineProperty(window, "_230_res_html", {
		value: `<?xml version="1.0" encoding="utf-8" ?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
	<!-- Generated by Game Dumper, source URL: ${window.location.href} -->
	<head>
		<meta http-equiv="Content-Type" content="text/html;charset=utf-8" />
		<meta http-equiv="Referrer-Policy" content="no-referrer" />
		<meta name="referrer" content="no-referrer" />
		<meta name="viewport" content="width=device-width,initial-scale=1" />
		<base href="." target="_blank" />
		<script type="text/javascript">
"use strict";
(() => {
const _fetch_ = window.fetch;
const _pathMap_ = ${JSON.stringify(map, void 0, "\t")};

window.fetch = (req, init) => {
	req = new Request(req, init);
	switch (req.method) {
		case "GET":
		case "HEAD":
			break;
		default:
			return _fetch_(req);
	}

	const url = new URL(req.url);
	switch (url.protocol) {
		case "http:":
		case "https:":
			break;
		default:
			return _fetch_(req);
	}

	const nsrc = _pathMap_[url.origin + url.pathname];
	if (nsrc != null)
		return _fetch_(nsrc, req);
	else
		return _fetch_(req);
};
})();
		</script>
		${document.head.innerHTML}
	</head>
	<body>
		${document.body.innerHTML}
	</body>
</html>\n`,
		writable: false,
		enumerable: false,
		configurable: false
	});
})();