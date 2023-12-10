/// <reference lib="es2015" />
/// <reference types="node" />
/// <reference no-default-lib="true" />

declare global {
	export type nul = null | undefined | void;
	export type func = (...args: any[]) => any;
	export type Awaitable<E> = PromiseLike<E> | E;

	export interface DumpOptions {
		/**
		 * @default 2500
		 */
		awaitTime?: number | nul;
		/**
		 * @default false
		 */
		rewritePath?: boolean | nul;
		/**
		 * @default true
		 */
		crossOrigin?: boolean | nul;
	}
	export interface DumpResults {
		readonly [path: string]: Blob;
	}
	export interface GameDumper {
		(): GameDumper;
		new(): GameDumper;
		readonly prototype: GameDumper;
		readonly dump: (url: string | URL, options?: DumpOptions | nul) => Promise<DumpResults>;
	}
}

declare const GameDumper: GameDumper;
export { GameDumper };
export default GameDumper;