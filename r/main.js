import dump from "./dump.js";

/**
 * @typedef {import("../types.d.ts").GameDumper} GameDumper
 * @type {GameDumper}
 */
const __proto__ = function __struct__() { return GameDumper; };
/**
 * @type {GameDumper}
 */
const GameDumper = function __struct__() { return GameDumper; };

Object.setPrototypeOf(GameDumper, __proto__);
Object.defineProperties(__proto__, {
	"prototype": {
		value: __proto__,
		writable: false,
		enumerable: false,
		configurable: false
	},
	[Symbol.toStringTag]: {
		value: "GameDumper",
		writable: false,
		enumerable: false,
		configurable: false
	},
	dump: {
		value: (...args) => {
			if (args.length !== 1)
				throw new Error("Invalid arguments");

			args = String(args[0]);

			try {
				new URL(args);
			} catch (err) {
				throw new Error("Invalid URL: " + args);
			}
			return dump(args);
		}
	}
});
Object.defineProperty(GameDumper, "prototype", {
	value: __proto__,
	writable: false,
	enumerable: false,
	configurable: false
});

export { GameDumper };
export default GameDumper;