import { TagLib } from "taglib-wasm";
import wasmUrl from "../../node_modules/taglib-wasm/dist/taglib-web.wasm?url";

let instance: Promise<TagLib> | null = null;

export function loadTagLib(): Promise<TagLib> {
  instance ??= fetchWasm().then((wasmBinary) => TagLib.initialize({ wasmBinary }));
  return instance;
}

async function fetchWasm(): Promise<Uint8Array> {
  const response = await fetch(wasmUrl);
  if (!response.ok) throw new Error("The tagging engine could not be loaded.");
  return new Uint8Array(await response.arrayBuffer());
}
