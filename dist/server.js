// dashboard/server/index.ts
import fs17 from "node:fs";
import path16 from "node:path";

// node_modules/@hono/node-server/dist/index.mjs
import { createServer as createServerHTTP } from "http";
import { Http2ServerRequest as Http2ServerRequest2 } from "http2";
import { Http2ServerRequest } from "http2";
import { Readable } from "stream";
import crypto from "crypto";
var RequestError = class extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "RequestError";
  }
};
var toRequestError = (e) => {
  if (e instanceof RequestError) {
    return e;
  }
  return new RequestError(e.message, { cause: e });
};
var GlobalRequest = global.Request;
var Request2 = class extends GlobalRequest {
  constructor(input, options) {
    if (typeof input === "object" && getRequestCache in input) {
      input = input[getRequestCache]();
    }
    if (typeof options?.body?.getReader !== "undefined") {
      ;
      options.duplex ??= "half";
    }
    super(input, options);
  }
};
var newHeadersFromIncoming = (incoming) => {
  const headerRecord = [];
  const rawHeaders = incoming.rawHeaders;
  for (let i = 0; i < rawHeaders.length; i += 2) {
    const { [i]: key, [i + 1]: value } = rawHeaders;
    if (key.charCodeAt(0) !== /*:*/
    58) {
      headerRecord.push([key, value]);
    }
  }
  return new Headers(headerRecord);
};
var wrapBodyStream = /* @__PURE__ */ Symbol("wrapBodyStream");
var newRequestFromIncoming = (method, url, headers, incoming, abortController) => {
  const init = {
    method,
    headers,
    signal: abortController.signal
  };
  if (method === "TRACE") {
    init.method = "GET";
    const req = new Request2(url, init);
    Object.defineProperty(req, "method", {
      get() {
        return "TRACE";
      }
    });
    return req;
  }
  if (!(method === "GET" || method === "HEAD")) {
    if ("rawBody" in incoming && incoming.rawBody instanceof Buffer) {
      init.body = new ReadableStream({
        start(controller) {
          controller.enqueue(incoming.rawBody);
          controller.close();
        }
      });
    } else if (incoming[wrapBodyStream]) {
      let reader;
      init.body = new ReadableStream({
        async pull(controller) {
          try {
            reader ||= Readable.toWeb(incoming).getReader();
            const { done, value } = await reader.read();
            if (done) {
              controller.close();
            } else {
              controller.enqueue(value);
            }
          } catch (error) {
            controller.error(error);
          }
        }
      });
    } else {
      init.body = Readable.toWeb(incoming);
    }
  }
  return new Request2(url, init);
};
var getRequestCache = /* @__PURE__ */ Symbol("getRequestCache");
var requestCache = /* @__PURE__ */ Symbol("requestCache");
var incomingKey = /* @__PURE__ */ Symbol("incomingKey");
var urlKey = /* @__PURE__ */ Symbol("urlKey");
var headersKey = /* @__PURE__ */ Symbol("headersKey");
var abortControllerKey = /* @__PURE__ */ Symbol("abortControllerKey");
var getAbortController = /* @__PURE__ */ Symbol("getAbortController");
var requestPrototype = {
  get method() {
    return this[incomingKey].method || "GET";
  },
  get url() {
    return this[urlKey];
  },
  get headers() {
    return this[headersKey] ||= newHeadersFromIncoming(this[incomingKey]);
  },
  [getAbortController]() {
    this[getRequestCache]();
    return this[abortControllerKey];
  },
  [getRequestCache]() {
    this[abortControllerKey] ||= new AbortController();
    return this[requestCache] ||= newRequestFromIncoming(
      this.method,
      this[urlKey],
      this.headers,
      this[incomingKey],
      this[abortControllerKey]
    );
  }
};
[
  "body",
  "bodyUsed",
  "cache",
  "credentials",
  "destination",
  "integrity",
  "mode",
  "redirect",
  "referrer",
  "referrerPolicy",
  "signal",
  "keepalive"
].forEach((k) => {
  Object.defineProperty(requestPrototype, k, {
    get() {
      return this[getRequestCache]()[k];
    }
  });
});
["arrayBuffer", "blob", "clone", "formData", "json", "text"].forEach((k) => {
  Object.defineProperty(requestPrototype, k, {
    value: function() {
      return this[getRequestCache]()[k]();
    }
  });
});
Object.setPrototypeOf(requestPrototype, Request2.prototype);
var newRequest = (incoming, defaultHostname) => {
  const req = Object.create(requestPrototype);
  req[incomingKey] = incoming;
  const incomingUrl = incoming.url || "";
  if (incomingUrl[0] !== "/" && // short-circuit for performance. most requests are relative URL.
  (incomingUrl.startsWith("http://") || incomingUrl.startsWith("https://"))) {
    if (incoming instanceof Http2ServerRequest) {
      throw new RequestError("Absolute URL for :path is not allowed in HTTP/2");
    }
    try {
      const url2 = new URL(incomingUrl);
      req[urlKey] = url2.href;
    } catch (e) {
      throw new RequestError("Invalid absolute URL", { cause: e });
    }
    return req;
  }
  const host = (incoming instanceof Http2ServerRequest ? incoming.authority : incoming.headers.host) || defaultHostname;
  if (!host) {
    throw new RequestError("Missing host header");
  }
  let scheme;
  if (incoming instanceof Http2ServerRequest) {
    scheme = incoming.scheme;
    if (!(scheme === "http" || scheme === "https")) {
      throw new RequestError("Unsupported scheme");
    }
  } else {
    scheme = incoming.socket && incoming.socket.encrypted ? "https" : "http";
  }
  const url = new URL(`${scheme}://${host}${incomingUrl}`);
  if (url.hostname.length !== host.length && url.hostname !== host.replace(/:\d+$/, "")) {
    throw new RequestError("Invalid host header");
  }
  req[urlKey] = url.href;
  return req;
};
var responseCache = /* @__PURE__ */ Symbol("responseCache");
var getResponseCache = /* @__PURE__ */ Symbol("getResponseCache");
var cacheKey = /* @__PURE__ */ Symbol("cache");
var GlobalResponse = global.Response;
var Response2 = class _Response {
  #body;
  #init;
  [getResponseCache]() {
    delete this[cacheKey];
    return this[responseCache] ||= new GlobalResponse(this.#body, this.#init);
  }
  constructor(body, init) {
    let headers;
    this.#body = body;
    if (init instanceof _Response) {
      const cachedGlobalResponse = init[responseCache];
      if (cachedGlobalResponse) {
        this.#init = cachedGlobalResponse;
        this[getResponseCache]();
        return;
      } else {
        this.#init = init.#init;
        headers = new Headers(init.#init.headers);
      }
    } else {
      this.#init = init;
    }
    if (typeof body === "string" || typeof body?.getReader !== "undefined" || body instanceof Blob || body instanceof Uint8Array) {
      headers ||= init?.headers || { "content-type": "text/plain; charset=UTF-8" };
      this[cacheKey] = [init?.status || 200, body, headers];
    }
  }
  get headers() {
    const cache = this[cacheKey];
    if (cache) {
      if (!(cache[2] instanceof Headers)) {
        cache[2] = new Headers(cache[2]);
      }
      return cache[2];
    }
    return this[getResponseCache]().headers;
  }
  get status() {
    return this[cacheKey]?.[0] ?? this[getResponseCache]().status;
  }
  get ok() {
    const status = this.status;
    return status >= 200 && status < 300;
  }
};
["body", "bodyUsed", "redirected", "statusText", "trailers", "type", "url"].forEach((k) => {
  Object.defineProperty(Response2.prototype, k, {
    get() {
      return this[getResponseCache]()[k];
    }
  });
});
["arrayBuffer", "blob", "clone", "formData", "json", "text"].forEach((k) => {
  Object.defineProperty(Response2.prototype, k, {
    value: function() {
      return this[getResponseCache]()[k]();
    }
  });
});
Object.setPrototypeOf(Response2, GlobalResponse);
Object.setPrototypeOf(Response2.prototype, GlobalResponse.prototype);
async function readWithoutBlocking(readPromise) {
  return Promise.race([readPromise, Promise.resolve().then(() => Promise.resolve(void 0))]);
}
function writeFromReadableStreamDefaultReader(reader, writable, currentReadPromise) {
  const cancel = (error) => {
    reader.cancel(error).catch(() => {
    });
  };
  writable.on("close", cancel);
  writable.on("error", cancel);
  (currentReadPromise ?? reader.read()).then(flow, handleStreamError);
  return reader.closed.finally(() => {
    writable.off("close", cancel);
    writable.off("error", cancel);
  });
  function handleStreamError(error) {
    if (error) {
      writable.destroy(error);
    }
  }
  function onDrain() {
    reader.read().then(flow, handleStreamError);
  }
  function flow({ done, value }) {
    try {
      if (done) {
        writable.end();
      } else if (!writable.write(value)) {
        writable.once("drain", onDrain);
      } else {
        return reader.read().then(flow, handleStreamError);
      }
    } catch (e) {
      handleStreamError(e);
    }
  }
}
function writeFromReadableStream(stream, writable) {
  if (stream.locked) {
    throw new TypeError("ReadableStream is locked.");
  } else if (writable.destroyed) {
    return;
  }
  return writeFromReadableStreamDefaultReader(stream.getReader(), writable);
}
var buildOutgoingHttpHeaders = (headers) => {
  const res = {};
  if (!(headers instanceof Headers)) {
    headers = new Headers(headers ?? void 0);
  }
  const cookies = [];
  for (const [k, v] of headers) {
    if (k === "set-cookie") {
      cookies.push(v);
    } else {
      res[k] = v;
    }
  }
  if (cookies.length > 0) {
    res["set-cookie"] = cookies;
  }
  res["content-type"] ??= "text/plain; charset=UTF-8";
  return res;
};
var X_ALREADY_SENT = "x-hono-already-sent";
if (typeof global.crypto === "undefined") {
  global.crypto = crypto;
}
var outgoingEnded = /* @__PURE__ */ Symbol("outgoingEnded");
var handleRequestError = () => new Response(null, {
  status: 400
});
var handleFetchError = (e) => new Response(null, {
  status: e instanceof Error && (e.name === "TimeoutError" || e.constructor.name === "TimeoutError") ? 504 : 500
});
var handleResponseError = (e, outgoing) => {
  const err = e instanceof Error ? e : new Error("unknown error", { cause: e });
  if (err.code === "ERR_STREAM_PREMATURE_CLOSE") {
    console.info("The user aborted a request.");
  } else {
    console.error(e);
    if (!outgoing.headersSent) {
      outgoing.writeHead(500, { "Content-Type": "text/plain" });
    }
    outgoing.end(`Error: ${err.message}`);
    outgoing.destroy(err);
  }
};
var flushHeaders = (outgoing) => {
  if ("flushHeaders" in outgoing && outgoing.writable) {
    outgoing.flushHeaders();
  }
};
var responseViaCache = async (res, outgoing) => {
  let [status, body, header] = res[cacheKey];
  if (header instanceof Headers) {
    header = buildOutgoingHttpHeaders(header);
  }
  if (typeof body === "string") {
    header["Content-Length"] = Buffer.byteLength(body);
  } else if (body instanceof Uint8Array) {
    header["Content-Length"] = body.byteLength;
  } else if (body instanceof Blob) {
    header["Content-Length"] = body.size;
  }
  outgoing.writeHead(status, header);
  if (typeof body === "string" || body instanceof Uint8Array) {
    outgoing.end(body);
  } else if (body instanceof Blob) {
    outgoing.end(new Uint8Array(await body.arrayBuffer()));
  } else {
    flushHeaders(outgoing);
    await writeFromReadableStream(body, outgoing)?.catch(
      (e) => handleResponseError(e, outgoing)
    );
  }
  ;
  outgoing[outgoingEnded]?.();
};
var isPromise = (res) => typeof res.then === "function";
var responseViaResponseObject = async (res, outgoing, options = {}) => {
  if (isPromise(res)) {
    if (options.errorHandler) {
      try {
        res = await res;
      } catch (err) {
        const errRes = await options.errorHandler(err);
        if (!errRes) {
          return;
        }
        res = errRes;
      }
    } else {
      res = await res.catch(handleFetchError);
    }
  }
  if (cacheKey in res) {
    return responseViaCache(res, outgoing);
  }
  const resHeaderRecord = buildOutgoingHttpHeaders(res.headers);
  if (res.body) {
    const reader = res.body.getReader();
    const values = [];
    let done = false;
    let currentReadPromise = void 0;
    if (resHeaderRecord["transfer-encoding"] !== "chunked") {
      let maxReadCount = 2;
      for (let i = 0; i < maxReadCount; i++) {
        currentReadPromise ||= reader.read();
        const chunk = await readWithoutBlocking(currentReadPromise).catch((e) => {
          console.error(e);
          done = true;
        });
        if (!chunk) {
          if (i === 1) {
            await new Promise((resolve) => setTimeout(resolve));
            maxReadCount = 3;
            continue;
          }
          break;
        }
        currentReadPromise = void 0;
        if (chunk.value) {
          values.push(chunk.value);
        }
        if (chunk.done) {
          done = true;
          break;
        }
      }
      if (done && !("content-length" in resHeaderRecord)) {
        resHeaderRecord["content-length"] = values.reduce((acc, value) => acc + value.length, 0);
      }
    }
    outgoing.writeHead(res.status, resHeaderRecord);
    values.forEach((value) => {
      ;
      outgoing.write(value);
    });
    if (done) {
      outgoing.end();
    } else {
      if (values.length === 0) {
        flushHeaders(outgoing);
      }
      await writeFromReadableStreamDefaultReader(reader, outgoing, currentReadPromise);
    }
  } else if (resHeaderRecord[X_ALREADY_SENT]) {
  } else {
    outgoing.writeHead(res.status, resHeaderRecord);
    outgoing.end();
  }
  ;
  outgoing[outgoingEnded]?.();
};
var getRequestListener = (fetchCallback, options = {}) => {
  const autoCleanupIncoming = options.autoCleanupIncoming ?? true;
  if (options.overrideGlobalObjects !== false && global.Request !== Request2) {
    Object.defineProperty(global, "Request", {
      value: Request2
    });
    Object.defineProperty(global, "Response", {
      value: Response2
    });
  }
  return async (incoming, outgoing) => {
    let res, req;
    try {
      req = newRequest(incoming, options.hostname);
      let incomingEnded = !autoCleanupIncoming || incoming.method === "GET" || incoming.method === "HEAD";
      if (!incomingEnded) {
        ;
        incoming[wrapBodyStream] = true;
        incoming.on("end", () => {
          incomingEnded = true;
        });
        if (incoming instanceof Http2ServerRequest2) {
          ;
          outgoing[outgoingEnded] = () => {
            if (!incomingEnded) {
              setTimeout(() => {
                if (!incomingEnded) {
                  setTimeout(() => {
                    incoming.destroy();
                    outgoing.destroy();
                  });
                }
              });
            }
          };
        }
      }
      outgoing.on("close", () => {
        const abortController = req[abortControllerKey];
        if (abortController) {
          if (incoming.errored) {
            req[abortControllerKey].abort(incoming.errored.toString());
          } else if (!outgoing.writableFinished) {
            req[abortControllerKey].abort("Client connection prematurely closed.");
          }
        }
        if (!incomingEnded) {
          setTimeout(() => {
            if (!incomingEnded) {
              setTimeout(() => {
                incoming.destroy();
              });
            }
          });
        }
      });
      res = fetchCallback(req, { incoming, outgoing });
      if (cacheKey in res) {
        return responseViaCache(res, outgoing);
      }
    } catch (e) {
      if (!res) {
        if (options.errorHandler) {
          res = await options.errorHandler(req ? e : toRequestError(e));
          if (!res) {
            return;
          }
        } else if (!req) {
          res = handleRequestError();
        } else {
          res = handleFetchError(e);
        }
      } else {
        return handleResponseError(e, outgoing);
      }
    }
    try {
      return await responseViaResponseObject(res, outgoing, options);
    } catch (e) {
      return handleResponseError(e, outgoing);
    }
  };
};
var createAdaptorServer = (options) => {
  const fetchCallback = options.fetch;
  const requestListener = getRequestListener(fetchCallback, {
    hostname: options.hostname,
    overrideGlobalObjects: options.overrideGlobalObjects,
    autoCleanupIncoming: options.autoCleanupIncoming
  });
  const createServer = options.createServer || createServerHTTP;
  const server = createServer(options.serverOptions || {}, requestListener);
  return server;
};
var serve = (options, listeningListener) => {
  const server = createAdaptorServer(options);
  server.listen(options?.port ?? 3e3, options.hostname, () => {
    const serverInfo = server.address();
    listeningListener && listeningListener(serverInfo);
  });
  return server;
};

// node_modules/hono/dist/utils/mime.js
var getMimeType = (filename, mimes = baseMimes) => {
  const regexp = /\.([a-zA-Z0-9]+?)$/;
  const match2 = filename.match(regexp);
  if (!match2) {
    return;
  }
  let mimeType = mimes[match2[1]];
  if (mimeType && mimeType.startsWith("text")) {
    mimeType += "; charset=utf-8";
  }
  return mimeType;
};
var _baseMimes = {
  aac: "audio/aac",
  avi: "video/x-msvideo",
  avif: "image/avif",
  av1: "video/av1",
  bin: "application/octet-stream",
  bmp: "image/bmp",
  css: "text/css",
  csv: "text/csv",
  eot: "application/vnd.ms-fontobject",
  epub: "application/epub+zip",
  gif: "image/gif",
  gz: "application/gzip",
  htm: "text/html",
  html: "text/html",
  ico: "image/x-icon",
  ics: "text/calendar",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  js: "text/javascript",
  json: "application/json",
  jsonld: "application/ld+json",
  map: "application/json",
  mid: "audio/x-midi",
  midi: "audio/x-midi",
  mjs: "text/javascript",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
  mpeg: "video/mpeg",
  oga: "audio/ogg",
  ogv: "video/ogg",
  ogx: "application/ogg",
  opus: "audio/opus",
  otf: "font/otf",
  pdf: "application/pdf",
  png: "image/png",
  rtf: "application/rtf",
  svg: "image/svg+xml",
  tif: "image/tiff",
  tiff: "image/tiff",
  ts: "video/mp2t",
  ttf: "font/ttf",
  txt: "text/plain",
  wasm: "application/wasm",
  webm: "video/webm",
  weba: "audio/webm",
  webmanifest: "application/manifest+json",
  webp: "image/webp",
  woff: "font/woff",
  woff2: "font/woff2",
  xhtml: "application/xhtml+xml",
  xml: "application/xml",
  zip: "application/zip",
  "3gp": "video/3gpp",
  "3g2": "video/3gpp2",
  gltf: "model/gltf+json",
  glb: "model/gltf-binary"
};
var baseMimes = _baseMimes;

// node_modules/@hono/node-server/dist/serve-static.mjs
import { createReadStream, statSync, existsSync } from "fs";
import { join } from "path";
import { versions } from "process";
import { Readable as Readable2 } from "stream";
var COMPRESSIBLE_CONTENT_TYPE_REGEX = /^\s*(?:text\/[^;\s]+|application\/(?:javascript|json|xml|xml-dtd|ecmascript|dart|postscript|rtf|tar|toml|vnd\.dart|vnd\.ms-fontobject|vnd\.ms-opentype|wasm|x-httpd-php|x-javascript|x-ns-proxy-autoconfig|x-sh|x-tar|x-virtualbox-hdd|x-virtualbox-ova|x-virtualbox-ovf|x-virtualbox-vbox|x-virtualbox-vdi|x-virtualbox-vhd|x-virtualbox-vmdk|x-www-form-urlencoded)|font\/(?:otf|ttf)|image\/(?:bmp|vnd\.adobe\.photoshop|vnd\.microsoft\.icon|vnd\.ms-dds|x-icon|x-ms-bmp)|message\/rfc822|model\/gltf-binary|x-shader\/x-fragment|x-shader\/x-vertex|[^;\s]+?\+(?:json|text|xml|yaml))(?:[;\s]|$)/i;
var ENCODINGS = {
  br: ".br",
  zstd: ".zst",
  gzip: ".gz"
};
var ENCODINGS_ORDERED_KEYS = Object.keys(ENCODINGS);
var pr54206Applied = () => {
  const [major, minor] = versions.node.split(".").map((component) => parseInt(component));
  return major >= 23 || major === 22 && minor >= 7 || major === 20 && minor >= 18;
};
var useReadableToWeb = pr54206Applied();
var createStreamBody = (stream) => {
  if (useReadableToWeb) {
    return Readable2.toWeb(stream);
  }
  const body = new ReadableStream({
    start(controller) {
      stream.on("data", (chunk) => {
        controller.enqueue(chunk);
      });
      stream.on("error", (err) => {
        controller.error(err);
      });
      stream.on("end", () => {
        controller.close();
      });
    },
    cancel() {
      stream.destroy();
    }
  });
  return body;
};
var getStats = (path17) => {
  let stats;
  try {
    stats = statSync(path17);
  } catch {
  }
  return stats;
};
var serveStatic = (options = { root: "" }) => {
  const root = options.root || "";
  const optionPath = options.path;
  if (root !== "" && !existsSync(root)) {
    console.error(`serveStatic: root path '${root}' is not found, are you sure it's correct?`);
  }
  return async (c, next) => {
    if (c.finalized) {
      return next();
    }
    let filename;
    if (optionPath) {
      filename = optionPath;
    } else {
      try {
        filename = decodeURIComponent(c.req.path);
        if (/(?:^|[\/\\])\.\.(?:$|[\/\\])/.test(filename)) {
          throw new Error();
        }
      } catch {
        await options.onNotFound?.(c.req.path, c);
        return next();
      }
    }
    let path17 = join(
      root,
      !optionPath && options.rewriteRequestPath ? options.rewriteRequestPath(filename, c) : filename
    );
    let stats = getStats(path17);
    if (stats && stats.isDirectory()) {
      const indexFile = options.index ?? "index.html";
      path17 = join(path17, indexFile);
      stats = getStats(path17);
    }
    if (!stats) {
      await options.onNotFound?.(path17, c);
      return next();
    }
    const mimeType = getMimeType(path17);
    c.header("Content-Type", mimeType || "application/octet-stream");
    if (options.precompressed && (!mimeType || COMPRESSIBLE_CONTENT_TYPE_REGEX.test(mimeType))) {
      const acceptEncodingSet = new Set(
        c.req.header("Accept-Encoding")?.split(",").map((encoding) => encoding.trim())
      );
      for (const encoding of ENCODINGS_ORDERED_KEYS) {
        if (!acceptEncodingSet.has(encoding)) {
          continue;
        }
        const precompressedStats = getStats(path17 + ENCODINGS[encoding]);
        if (precompressedStats) {
          c.header("Content-Encoding", encoding);
          c.header("Vary", "Accept-Encoding", { append: true });
          stats = precompressedStats;
          path17 = path17 + ENCODINGS[encoding];
          break;
        }
      }
    }
    let result;
    const size = stats.size;
    const range = c.req.header("range") || "";
    if (c.req.method == "HEAD" || c.req.method == "OPTIONS") {
      c.header("Content-Length", size.toString());
      c.status(200);
      result = c.body(null);
    } else if (!range) {
      c.header("Content-Length", size.toString());
      result = c.body(createStreamBody(createReadStream(path17)), 200);
    } else {
      c.header("Accept-Ranges", "bytes");
      c.header("Date", stats.birthtime.toUTCString());
      const parts = range.replace(/bytes=/, "").split("-", 2);
      const start = parseInt(parts[0], 10) || 0;
      let end = parseInt(parts[1], 10) || size - 1;
      if (size < end - start + 1) {
        end = size - 1;
      }
      const chunksize = end - start + 1;
      const stream = createReadStream(path17, { start, end });
      c.header("Content-Length", chunksize.toString());
      c.header("Content-Range", `bytes ${start}-${end}/${stats.size}`);
      result = c.body(createStreamBody(stream), 206);
    }
    await options.onFound?.(path17, c);
    return result;
  };
};

// node_modules/hono/dist/compose.js
var compose = (middleware, onError, onNotFound) => {
  return (context, next) => {
    let index = -1;
    return dispatch(0);
    async function dispatch(i) {
      if (i <= index) {
        throw new Error("next() called multiple times");
      }
      index = i;
      let res;
      let isError = false;
      let handler;
      if (middleware[i]) {
        handler = middleware[i][0][0];
        context.req.routeIndex = i;
      } else {
        handler = i === middleware.length && next || void 0;
      }
      if (handler) {
        try {
          res = await handler(context, () => dispatch(i + 1));
        } catch (err) {
          if (err instanceof Error && onError) {
            context.error = err;
            res = await onError(err, context);
            isError = true;
          } else {
            throw err;
          }
        }
      } else {
        if (context.finalized === false && onNotFound) {
          res = await onNotFound(context);
        }
      }
      if (res && (context.finalized === false || isError)) {
        context.res = res;
      }
      return context;
    }
  };
};

// node_modules/hono/dist/request/constants.js
var GET_MATCH_RESULT = /* @__PURE__ */ Symbol();

// node_modules/hono/dist/utils/body.js
var parseBody = async (request, options = /* @__PURE__ */ Object.create(null)) => {
  const { all = false, dot = false } = options;
  const headers = request instanceof HonoRequest ? request.raw.headers : request.headers;
  const contentType = headers.get("Content-Type");
  if (contentType?.startsWith("multipart/form-data") || contentType?.startsWith("application/x-www-form-urlencoded")) {
    return parseFormData(request, { all, dot });
  }
  return {};
};
async function parseFormData(request, options) {
  const formData = await request.formData();
  if (formData) {
    return convertFormDataToBodyData(formData, options);
  }
  return {};
}
function convertFormDataToBodyData(formData, options) {
  const form = /* @__PURE__ */ Object.create(null);
  formData.forEach((value, key) => {
    const shouldParseAllValues = options.all || key.endsWith("[]");
    if (!shouldParseAllValues) {
      form[key] = value;
    } else {
      handleParsingAllValues(form, key, value);
    }
  });
  if (options.dot) {
    Object.entries(form).forEach(([key, value]) => {
      const shouldParseDotValues = key.includes(".");
      if (shouldParseDotValues) {
        handleParsingNestedValues(form, key, value);
        delete form[key];
      }
    });
  }
  return form;
}
var handleParsingAllValues = (form, key, value) => {
  if (form[key] !== void 0) {
    if (Array.isArray(form[key])) {
      ;
      form[key].push(value);
    } else {
      form[key] = [form[key], value];
    }
  } else {
    if (!key.endsWith("[]")) {
      form[key] = value;
    } else {
      form[key] = [value];
    }
  }
};
var handleParsingNestedValues = (form, key, value) => {
  let nestedForm = form;
  const keys = key.split(".");
  keys.forEach((key2, index) => {
    if (index === keys.length - 1) {
      nestedForm[key2] = value;
    } else {
      if (!nestedForm[key2] || typeof nestedForm[key2] !== "object" || Array.isArray(nestedForm[key2]) || nestedForm[key2] instanceof File) {
        nestedForm[key2] = /* @__PURE__ */ Object.create(null);
      }
      nestedForm = nestedForm[key2];
    }
  });
};

// node_modules/hono/dist/utils/url.js
var splitPath = (path17) => {
  const paths = path17.split("/");
  if (paths[0] === "") {
    paths.shift();
  }
  return paths;
};
var splitRoutingPath = (routePath) => {
  const { groups, path: path17 } = extractGroupsFromPath(routePath);
  const paths = splitPath(path17);
  return replaceGroupMarks(paths, groups);
};
var extractGroupsFromPath = (path17) => {
  const groups = [];
  path17 = path17.replace(/\{[^}]+\}/g, (match2, index) => {
    const mark = `@${index}`;
    groups.push([mark, match2]);
    return mark;
  });
  return { groups, path: path17 };
};
var replaceGroupMarks = (paths, groups) => {
  for (let i = groups.length - 1; i >= 0; i--) {
    const [mark] = groups[i];
    for (let j = paths.length - 1; j >= 0; j--) {
      if (paths[j].includes(mark)) {
        paths[j] = paths[j].replace(mark, groups[i][1]);
        break;
      }
    }
  }
  return paths;
};
var patternCache = {};
var getPattern = (label, next) => {
  if (label === "*") {
    return "*";
  }
  const match2 = label.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
  if (match2) {
    const cacheKey2 = `${label}#${next}`;
    if (!patternCache[cacheKey2]) {
      if (match2[2]) {
        patternCache[cacheKey2] = next && next[0] !== ":" && next[0] !== "*" ? [cacheKey2, match2[1], new RegExp(`^${match2[2]}(?=/${next})`)] : [label, match2[1], new RegExp(`^${match2[2]}$`)];
      } else {
        patternCache[cacheKey2] = [label, match2[1], true];
      }
    }
    return patternCache[cacheKey2];
  }
  return null;
};
var tryDecode = (str, decoder) => {
  try {
    return decoder(str);
  } catch {
    return str.replace(/(?:%[0-9A-Fa-f]{2})+/g, (match2) => {
      try {
        return decoder(match2);
      } catch {
        return match2;
      }
    });
  }
};
var tryDecodeURI = (str) => tryDecode(str, decodeURI);
var getPath = (request) => {
  const url = request.url;
  const start = url.indexOf("/", url.indexOf(":") + 4);
  let i = start;
  for (; i < url.length; i++) {
    const charCode = url.charCodeAt(i);
    if (charCode === 37) {
      const queryIndex = url.indexOf("?", i);
      const hashIndex = url.indexOf("#", i);
      const end = queryIndex === -1 ? hashIndex === -1 ? void 0 : hashIndex : hashIndex === -1 ? queryIndex : Math.min(queryIndex, hashIndex);
      const path17 = url.slice(start, end);
      return tryDecodeURI(path17.includes("%25") ? path17.replace(/%25/g, "%2525") : path17);
    } else if (charCode === 63 || charCode === 35) {
      break;
    }
  }
  return url.slice(start, i);
};
var getPathNoStrict = (request) => {
  const result = getPath(request);
  return result.length > 1 && result.at(-1) === "/" ? result.slice(0, -1) : result;
};
var mergePath = (base, sub, ...rest) => {
  if (rest.length) {
    sub = mergePath(sub, ...rest);
  }
  return `${base?.[0] === "/" ? "" : "/"}${base}${sub === "/" ? "" : `${base?.at(-1) === "/" ? "" : "/"}${sub?.[0] === "/" ? sub.slice(1) : sub}`}`;
};
var checkOptionalParameter = (path17) => {
  if (path17.charCodeAt(path17.length - 1) !== 63 || !path17.includes(":")) {
    return null;
  }
  const segments = path17.split("/");
  const results = [];
  let basePath = "";
  segments.forEach((segment) => {
    if (segment !== "" && !/\:/.test(segment)) {
      basePath += "/" + segment;
    } else if (/\:/.test(segment)) {
      if (/\?/.test(segment)) {
        if (results.length === 0 && basePath === "") {
          results.push("/");
        } else {
          results.push(basePath);
        }
        const optionalSegment = segment.replace("?", "");
        basePath += "/" + optionalSegment;
        results.push(basePath);
      } else {
        basePath += "/" + segment;
      }
    }
  });
  return results.filter((v, i, a) => a.indexOf(v) === i);
};
var _decodeURI = (value) => {
  if (!/[%+]/.test(value)) {
    return value;
  }
  if (value.indexOf("+") !== -1) {
    value = value.replace(/\+/g, " ");
  }
  return value.indexOf("%") !== -1 ? tryDecode(value, decodeURIComponent_) : value;
};
var _getQueryParam = (url, key, multiple) => {
  let encoded;
  if (!multiple && key && !/[%+]/.test(key)) {
    let keyIndex2 = url.indexOf("?", 8);
    if (keyIndex2 === -1) {
      return void 0;
    }
    if (!url.startsWith(key, keyIndex2 + 1)) {
      keyIndex2 = url.indexOf(`&${key}`, keyIndex2 + 1);
    }
    while (keyIndex2 !== -1) {
      const trailingKeyCode = url.charCodeAt(keyIndex2 + key.length + 1);
      if (trailingKeyCode === 61) {
        const valueIndex = keyIndex2 + key.length + 2;
        const endIndex = url.indexOf("&", valueIndex);
        return _decodeURI(url.slice(valueIndex, endIndex === -1 ? void 0 : endIndex));
      } else if (trailingKeyCode == 38 || isNaN(trailingKeyCode)) {
        return "";
      }
      keyIndex2 = url.indexOf(`&${key}`, keyIndex2 + 1);
    }
    encoded = /[%+]/.test(url);
    if (!encoded) {
      return void 0;
    }
  }
  const results = {};
  encoded ??= /[%+]/.test(url);
  let keyIndex = url.indexOf("?", 8);
  while (keyIndex !== -1) {
    const nextKeyIndex = url.indexOf("&", keyIndex + 1);
    let valueIndex = url.indexOf("=", keyIndex);
    if (valueIndex > nextKeyIndex && nextKeyIndex !== -1) {
      valueIndex = -1;
    }
    let name = url.slice(
      keyIndex + 1,
      valueIndex === -1 ? nextKeyIndex === -1 ? void 0 : nextKeyIndex : valueIndex
    );
    if (encoded) {
      name = _decodeURI(name);
    }
    keyIndex = nextKeyIndex;
    if (name === "") {
      continue;
    }
    let value;
    if (valueIndex === -1) {
      value = "";
    } else {
      value = url.slice(valueIndex + 1, nextKeyIndex === -1 ? void 0 : nextKeyIndex);
      if (encoded) {
        value = _decodeURI(value);
      }
    }
    if (multiple) {
      if (!(results[name] && Array.isArray(results[name]))) {
        results[name] = [];
      }
      ;
      results[name].push(value);
    } else {
      results[name] ??= value;
    }
  }
  return key ? results[key] : results;
};
var getQueryParam = _getQueryParam;
var getQueryParams = (url, key) => {
  return _getQueryParam(url, key, true);
};
var decodeURIComponent_ = decodeURIComponent;

// node_modules/hono/dist/request.js
var tryDecodeURIComponent = (str) => tryDecode(str, decodeURIComponent_);
var HonoRequest = class {
  /**
   * `.raw` can get the raw Request object.
   *
   * @see {@link https://hono.dev/docs/api/request#raw}
   *
   * @example
   * ```ts
   * // For Cloudflare Workers
   * app.post('/', async (c) => {
   *   const metadata = c.req.raw.cf?.hostMetadata?
   *   ...
   * })
   * ```
   */
  raw;
  #validatedData;
  // Short name of validatedData
  #matchResult;
  routeIndex = 0;
  /**
   * `.path` can get the pathname of the request.
   *
   * @see {@link https://hono.dev/docs/api/request#path}
   *
   * @example
   * ```ts
   * app.get('/about/me', (c) => {
   *   const pathname = c.req.path // `/about/me`
   * })
   * ```
   */
  path;
  bodyCache = {};
  constructor(request, path17 = "/", matchResult = [[]]) {
    this.raw = request;
    this.path = path17;
    this.#matchResult = matchResult;
    this.#validatedData = {};
  }
  param(key) {
    return key ? this.#getDecodedParam(key) : this.#getAllDecodedParams();
  }
  #getDecodedParam(key) {
    const paramKey = this.#matchResult[0][this.routeIndex][1][key];
    const param = this.#getParamValue(paramKey);
    return param && /\%/.test(param) ? tryDecodeURIComponent(param) : param;
  }
  #getAllDecodedParams() {
    const decoded = {};
    const keys = Object.keys(this.#matchResult[0][this.routeIndex][1]);
    for (const key of keys) {
      const value = this.#getParamValue(this.#matchResult[0][this.routeIndex][1][key]);
      if (value !== void 0) {
        decoded[key] = /\%/.test(value) ? tryDecodeURIComponent(value) : value;
      }
    }
    return decoded;
  }
  #getParamValue(paramKey) {
    return this.#matchResult[1] ? this.#matchResult[1][paramKey] : paramKey;
  }
  query(key) {
    return getQueryParam(this.url, key);
  }
  queries(key) {
    return getQueryParams(this.url, key);
  }
  header(name) {
    if (name) {
      return this.raw.headers.get(name) ?? void 0;
    }
    const headerData = {};
    this.raw.headers.forEach((value, key) => {
      headerData[key] = value;
    });
    return headerData;
  }
  async parseBody(options) {
    return this.bodyCache.parsedBody ??= await parseBody(this, options);
  }
  #cachedBody = (key) => {
    const { bodyCache, raw: raw2 } = this;
    const cachedBody = bodyCache[key];
    if (cachedBody) {
      return cachedBody;
    }
    const anyCachedKey = Object.keys(bodyCache)[0];
    if (anyCachedKey) {
      return bodyCache[anyCachedKey].then((body) => {
        if (anyCachedKey === "json") {
          body = JSON.stringify(body);
        }
        return new Response(body)[key]();
      });
    }
    return bodyCache[key] = raw2[key]();
  };
  /**
   * `.json()` can parse Request body of type `application/json`
   *
   * @see {@link https://hono.dev/docs/api/request#json}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.json()
   * })
   * ```
   */
  json() {
    return this.#cachedBody("text").then((text) => JSON.parse(text));
  }
  /**
   * `.text()` can parse Request body of type `text/plain`
   *
   * @see {@link https://hono.dev/docs/api/request#text}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.text()
   * })
   * ```
   */
  text() {
    return this.#cachedBody("text");
  }
  /**
   * `.arrayBuffer()` parse Request body as an `ArrayBuffer`
   *
   * @see {@link https://hono.dev/docs/api/request#arraybuffer}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.arrayBuffer()
   * })
   * ```
   */
  arrayBuffer() {
    return this.#cachedBody("arrayBuffer");
  }
  /**
   * Parses the request body as a `Blob`.
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.blob();
   * });
   * ```
   * @see https://hono.dev/docs/api/request#blob
   */
  blob() {
    return this.#cachedBody("blob");
  }
  /**
   * Parses the request body as `FormData`.
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.formData();
   * });
   * ```
   * @see https://hono.dev/docs/api/request#formdata
   */
  formData() {
    return this.#cachedBody("formData");
  }
  /**
   * Adds validated data to the request.
   *
   * @param target - The target of the validation.
   * @param data - The validated data to add.
   */
  addValidatedData(target, data) {
    this.#validatedData[target] = data;
  }
  valid(target) {
    return this.#validatedData[target];
  }
  /**
   * `.url()` can get the request url strings.
   *
   * @see {@link https://hono.dev/docs/api/request#url}
   *
   * @example
   * ```ts
   * app.get('/about/me', (c) => {
   *   const url = c.req.url // `http://localhost:8787/about/me`
   *   ...
   * })
   * ```
   */
  get url() {
    return this.raw.url;
  }
  /**
   * `.method()` can get the method name of the request.
   *
   * @see {@link https://hono.dev/docs/api/request#method}
   *
   * @example
   * ```ts
   * app.get('/about/me', (c) => {
   *   const method = c.req.method // `GET`
   * })
   * ```
   */
  get method() {
    return this.raw.method;
  }
  get [GET_MATCH_RESULT]() {
    return this.#matchResult;
  }
  /**
   * `.matchedRoutes()` can return a matched route in the handler
   *
   * @deprecated
   *
   * Use matchedRoutes helper defined in "hono/route" instead.
   *
   * @see {@link https://hono.dev/docs/api/request#matchedroutes}
   *
   * @example
   * ```ts
   * app.use('*', async function logger(c, next) {
   *   await next()
   *   c.req.matchedRoutes.forEach(({ handler, method, path }, i) => {
   *     const name = handler.name || (handler.length < 2 ? '[handler]' : '[middleware]')
   *     console.log(
   *       method,
   *       ' ',
   *       path,
   *       ' '.repeat(Math.max(10 - path.length, 0)),
   *       name,
   *       i === c.req.routeIndex ? '<- respond from here' : ''
   *     )
   *   })
   * })
   * ```
   */
  get matchedRoutes() {
    return this.#matchResult[0].map(([[, route]]) => route);
  }
  /**
   * `routePath()` can retrieve the path registered within the handler
   *
   * @deprecated
   *
   * Use routePath helper defined in "hono/route" instead.
   *
   * @see {@link https://hono.dev/docs/api/request#routepath}
   *
   * @example
   * ```ts
   * app.get('/posts/:id', (c) => {
   *   return c.json({ path: c.req.routePath })
   * })
   * ```
   */
  get routePath() {
    return this.#matchResult[0].map(([[, route]]) => route)[this.routeIndex].path;
  }
};

// node_modules/hono/dist/utils/html.js
var HtmlEscapedCallbackPhase = {
  Stringify: 1,
  BeforeStream: 2,
  Stream: 3
};
var raw = (value, callbacks) => {
  const escapedString = new String(value);
  escapedString.isEscaped = true;
  escapedString.callbacks = callbacks;
  return escapedString;
};
var resolveCallback = async (str, phase, preserveCallbacks, context, buffer) => {
  if (typeof str === "object" && !(str instanceof String)) {
    if (!(str instanceof Promise)) {
      str = str.toString();
    }
    if (str instanceof Promise) {
      str = await str;
    }
  }
  const callbacks = str.callbacks;
  if (!callbacks?.length) {
    return Promise.resolve(str);
  }
  if (buffer) {
    buffer[0] += str;
  } else {
    buffer = [str];
  }
  const resStr = Promise.all(callbacks.map((c) => c({ phase, buffer, context }))).then(
    (res) => Promise.all(
      res.filter(Boolean).map((str2) => resolveCallback(str2, phase, false, context, buffer))
    ).then(() => buffer[0])
  );
  if (preserveCallbacks) {
    return raw(await resStr, callbacks);
  } else {
    return resStr;
  }
};

// node_modules/hono/dist/context.js
var TEXT_PLAIN = "text/plain; charset=UTF-8";
var setDefaultContentType = (contentType, headers) => {
  return {
    "Content-Type": contentType,
    ...headers
  };
};
var Context = class {
  #rawRequest;
  #req;
  /**
   * `.env` can get bindings (environment variables, secrets, KV namespaces, D1 database, R2 bucket etc.) in Cloudflare Workers.
   *
   * @see {@link https://hono.dev/docs/api/context#env}
   *
   * @example
   * ```ts
   * // Environment object for Cloudflare Workers
   * app.get('*', async c => {
   *   const counter = c.env.COUNTER
   * })
   * ```
   */
  env = {};
  #var;
  finalized = false;
  /**
   * `.error` can get the error object from the middleware if the Handler throws an error.
   *
   * @see {@link https://hono.dev/docs/api/context#error}
   *
   * @example
   * ```ts
   * app.use('*', async (c, next) => {
   *   await next()
   *   if (c.error) {
   *     // do something...
   *   }
   * })
   * ```
   */
  error;
  #status;
  #executionCtx;
  #res;
  #layout;
  #renderer;
  #notFoundHandler;
  #preparedHeaders;
  #matchResult;
  #path;
  /**
   * Creates an instance of the Context class.
   *
   * @param req - The Request object.
   * @param options - Optional configuration options for the context.
   */
  constructor(req, options) {
    this.#rawRequest = req;
    if (options) {
      this.#executionCtx = options.executionCtx;
      this.env = options.env;
      this.#notFoundHandler = options.notFoundHandler;
      this.#path = options.path;
      this.#matchResult = options.matchResult;
    }
  }
  /**
   * `.req` is the instance of {@link HonoRequest}.
   */
  get req() {
    this.#req ??= new HonoRequest(this.#rawRequest, this.#path, this.#matchResult);
    return this.#req;
  }
  /**
   * @see {@link https://hono.dev/docs/api/context#event}
   * The FetchEvent associated with the current request.
   *
   * @throws Will throw an error if the context does not have a FetchEvent.
   */
  get event() {
    if (this.#executionCtx && "respondWith" in this.#executionCtx) {
      return this.#executionCtx;
    } else {
      throw Error("This context has no FetchEvent");
    }
  }
  /**
   * @see {@link https://hono.dev/docs/api/context#executionctx}
   * The ExecutionContext associated with the current request.
   *
   * @throws Will throw an error if the context does not have an ExecutionContext.
   */
  get executionCtx() {
    if (this.#executionCtx) {
      return this.#executionCtx;
    } else {
      throw Error("This context has no ExecutionContext");
    }
  }
  /**
   * @see {@link https://hono.dev/docs/api/context#res}
   * The Response object for the current request.
   */
  get res() {
    return this.#res ||= new Response(null, {
      headers: this.#preparedHeaders ??= new Headers()
    });
  }
  /**
   * Sets the Response object for the current request.
   *
   * @param _res - The Response object to set.
   */
  set res(_res) {
    if (this.#res && _res) {
      _res = new Response(_res.body, _res);
      for (const [k, v] of this.#res.headers.entries()) {
        if (k === "content-type") {
          continue;
        }
        if (k === "set-cookie") {
          const cookies = this.#res.headers.getSetCookie();
          _res.headers.delete("set-cookie");
          for (const cookie of cookies) {
            _res.headers.append("set-cookie", cookie);
          }
        } else {
          _res.headers.set(k, v);
        }
      }
    }
    this.#res = _res;
    this.finalized = true;
  }
  /**
   * `.render()` can create a response within a layout.
   *
   * @see {@link https://hono.dev/docs/api/context#render-setrenderer}
   *
   * @example
   * ```ts
   * app.get('/', (c) => {
   *   return c.render('Hello!')
   * })
   * ```
   */
  render = (...args) => {
    this.#renderer ??= (content) => this.html(content);
    return this.#renderer(...args);
  };
  /**
   * Sets the layout for the response.
   *
   * @param layout - The layout to set.
   * @returns The layout function.
   */
  setLayout = (layout) => this.#layout = layout;
  /**
   * Gets the current layout for the response.
   *
   * @returns The current layout function.
   */
  getLayout = () => this.#layout;
  /**
   * `.setRenderer()` can set the layout in the custom middleware.
   *
   * @see {@link https://hono.dev/docs/api/context#render-setrenderer}
   *
   * @example
   * ```tsx
   * app.use('*', async (c, next) => {
   *   c.setRenderer((content) => {
   *     return c.html(
   *       <html>
   *         <body>
   *           <p>{content}</p>
   *         </body>
   *       </html>
   *     )
   *   })
   *   await next()
   * })
   * ```
   */
  setRenderer = (renderer) => {
    this.#renderer = renderer;
  };
  /**
   * `.header()` can set headers.
   *
   * @see {@link https://hono.dev/docs/api/context#header}
   *
   * @example
   * ```ts
   * app.get('/welcome', (c) => {
   *   // Set headers
   *   c.header('X-Message', 'Hello!')
   *   c.header('Content-Type', 'text/plain')
   *
   *   return c.body('Thank you for coming')
   * })
   * ```
   */
  header = (name, value, options) => {
    if (this.finalized) {
      this.#res = new Response(this.#res.body, this.#res);
    }
    const headers = this.#res ? this.#res.headers : this.#preparedHeaders ??= new Headers();
    if (value === void 0) {
      headers.delete(name);
    } else if (options?.append) {
      headers.append(name, value);
    } else {
      headers.set(name, value);
    }
  };
  status = (status) => {
    this.#status = status;
  };
  /**
   * `.set()` can set the value specified by the key.
   *
   * @see {@link https://hono.dev/docs/api/context#set-get}
   *
   * @example
   * ```ts
   * app.use('*', async (c, next) => {
   *   c.set('message', 'Hono is hot!!')
   *   await next()
   * })
   * ```
   */
  set = (key, value) => {
    this.#var ??= /* @__PURE__ */ new Map();
    this.#var.set(key, value);
  };
  /**
   * `.get()` can use the value specified by the key.
   *
   * @see {@link https://hono.dev/docs/api/context#set-get}
   *
   * @example
   * ```ts
   * app.get('/', (c) => {
   *   const message = c.get('message')
   *   return c.text(`The message is "${message}"`)
   * })
   * ```
   */
  get = (key) => {
    return this.#var ? this.#var.get(key) : void 0;
  };
  /**
   * `.var` can access the value of a variable.
   *
   * @see {@link https://hono.dev/docs/api/context#var}
   *
   * @example
   * ```ts
   * const result = c.var.client.oneMethod()
   * ```
   */
  // c.var.propName is a read-only
  get var() {
    if (!this.#var) {
      return {};
    }
    return Object.fromEntries(this.#var);
  }
  #newResponse(data, arg, headers) {
    const responseHeaders = this.#res ? new Headers(this.#res.headers) : this.#preparedHeaders ?? new Headers();
    if (typeof arg === "object" && "headers" in arg) {
      const argHeaders = arg.headers instanceof Headers ? arg.headers : new Headers(arg.headers);
      for (const [key, value] of argHeaders) {
        if (key.toLowerCase() === "set-cookie") {
          responseHeaders.append(key, value);
        } else {
          responseHeaders.set(key, value);
        }
      }
    }
    if (headers) {
      for (const [k, v] of Object.entries(headers)) {
        if (typeof v === "string") {
          responseHeaders.set(k, v);
        } else {
          responseHeaders.delete(k);
          for (const v2 of v) {
            responseHeaders.append(k, v2);
          }
        }
      }
    }
    const status = typeof arg === "number" ? arg : arg?.status ?? this.#status;
    return new Response(data, { status, headers: responseHeaders });
  }
  newResponse = (...args) => this.#newResponse(...args);
  /**
   * `.body()` can return the HTTP response.
   * You can set headers with `.header()` and set HTTP status code with `.status`.
   * This can also be set in `.text()`, `.json()` and so on.
   *
   * @see {@link https://hono.dev/docs/api/context#body}
   *
   * @example
   * ```ts
   * app.get('/welcome', (c) => {
   *   // Set headers
   *   c.header('X-Message', 'Hello!')
   *   c.header('Content-Type', 'text/plain')
   *   // Set HTTP status code
   *   c.status(201)
   *
   *   // Return the response body
   *   return c.body('Thank you for coming')
   * })
   * ```
   */
  body = (data, arg, headers) => this.#newResponse(data, arg, headers);
  /**
   * `.text()` can render text as `Content-Type:text/plain`.
   *
   * @see {@link https://hono.dev/docs/api/context#text}
   *
   * @example
   * ```ts
   * app.get('/say', (c) => {
   *   return c.text('Hello!')
   * })
   * ```
   */
  text = (text, arg, headers) => {
    return !this.#preparedHeaders && !this.#status && !arg && !headers && !this.finalized ? new Response(text) : this.#newResponse(
      text,
      arg,
      setDefaultContentType(TEXT_PLAIN, headers)
    );
  };
  /**
   * `.json()` can render JSON as `Content-Type:application/json`.
   *
   * @see {@link https://hono.dev/docs/api/context#json}
   *
   * @example
   * ```ts
   * app.get('/api', (c) => {
   *   return c.json({ message: 'Hello!' })
   * })
   * ```
   */
  json = (object, arg, headers) => {
    return this.#newResponse(
      JSON.stringify(object),
      arg,
      setDefaultContentType("application/json", headers)
    );
  };
  html = (html, arg, headers) => {
    const res = (html2) => this.#newResponse(html2, arg, setDefaultContentType("text/html; charset=UTF-8", headers));
    return typeof html === "object" ? resolveCallback(html, HtmlEscapedCallbackPhase.Stringify, false, {}).then(res) : res(html);
  };
  /**
   * `.redirect()` can Redirect, default status code is 302.
   *
   * @see {@link https://hono.dev/docs/api/context#redirect}
   *
   * @example
   * ```ts
   * app.get('/redirect', (c) => {
   *   return c.redirect('/')
   * })
   * app.get('/redirect-permanently', (c) => {
   *   return c.redirect('/', 301)
   * })
   * ```
   */
  redirect = (location, status) => {
    const locationString = String(location);
    this.header(
      "Location",
      // Multibyes should be encoded
      // eslint-disable-next-line no-control-regex
      !/[^\x00-\xFF]/.test(locationString) ? locationString : encodeURI(locationString)
    );
    return this.newResponse(null, status ?? 302);
  };
  /**
   * `.notFound()` can return the Not Found Response.
   *
   * @see {@link https://hono.dev/docs/api/context#notfound}
   *
   * @example
   * ```ts
   * app.get('/notfound', (c) => {
   *   return c.notFound()
   * })
   * ```
   */
  notFound = () => {
    this.#notFoundHandler ??= () => new Response();
    return this.#notFoundHandler(this);
  };
};

// node_modules/hono/dist/router.js
var METHOD_NAME_ALL = "ALL";
var METHOD_NAME_ALL_LOWERCASE = "all";
var METHODS = ["get", "post", "put", "delete", "options", "patch"];
var MESSAGE_MATCHER_IS_ALREADY_BUILT = "Can not add a route since the matcher is already built.";
var UnsupportedPathError = class extends Error {
};

// node_modules/hono/dist/utils/constants.js
var COMPOSED_HANDLER = "__COMPOSED_HANDLER";

// node_modules/hono/dist/hono-base.js
var notFoundHandler = (c) => {
  return c.text("404 Not Found", 404);
};
var errorHandler = (err, c) => {
  if ("getResponse" in err) {
    const res = err.getResponse();
    return c.newResponse(res.body, res);
  }
  console.error(err);
  return c.text("Internal Server Error", 500);
};
var Hono = class _Hono {
  get;
  post;
  put;
  delete;
  options;
  patch;
  all;
  on;
  use;
  /*
    This class is like an abstract class and does not have a router.
    To use it, inherit the class and implement router in the constructor.
  */
  router;
  getPath;
  // Cannot use `#` because it requires visibility at JavaScript runtime.
  _basePath = "/";
  #path = "/";
  routes = [];
  constructor(options = {}) {
    const allMethods = [...METHODS, METHOD_NAME_ALL_LOWERCASE];
    allMethods.forEach((method) => {
      this[method] = (args1, ...args) => {
        if (typeof args1 === "string") {
          this.#path = args1;
        } else {
          this.#addRoute(method, this.#path, args1);
        }
        args.forEach((handler) => {
          this.#addRoute(method, this.#path, handler);
        });
        return this;
      };
    });
    this.on = (method, path17, ...handlers) => {
      for (const p of [path17].flat()) {
        this.#path = p;
        for (const m of [method].flat()) {
          handlers.map((handler) => {
            this.#addRoute(m.toUpperCase(), this.#path, handler);
          });
        }
      }
      return this;
    };
    this.use = (arg1, ...handlers) => {
      if (typeof arg1 === "string") {
        this.#path = arg1;
      } else {
        this.#path = "*";
        handlers.unshift(arg1);
      }
      handlers.forEach((handler) => {
        this.#addRoute(METHOD_NAME_ALL, this.#path, handler);
      });
      return this;
    };
    const { strict, ...optionsWithoutStrict } = options;
    Object.assign(this, optionsWithoutStrict);
    this.getPath = strict ?? true ? options.getPath ?? getPath : getPathNoStrict;
  }
  #clone() {
    const clone = new _Hono({
      router: this.router,
      getPath: this.getPath
    });
    clone.errorHandler = this.errorHandler;
    clone.#notFoundHandler = this.#notFoundHandler;
    clone.routes = this.routes;
    return clone;
  }
  #notFoundHandler = notFoundHandler;
  // Cannot use `#` because it requires visibility at JavaScript runtime.
  errorHandler = errorHandler;
  /**
   * `.route()` allows grouping other Hono instance in routes.
   *
   * @see {@link https://hono.dev/docs/api/routing#grouping}
   *
   * @param {string} path - base Path
   * @param {Hono} app - other Hono instance
   * @returns {Hono} routed Hono instance
   *
   * @example
   * ```ts
   * const app = new Hono()
   * const app2 = new Hono()
   *
   * app2.get("/user", (c) => c.text("user"))
   * app.route("/api", app2) // GET /api/user
   * ```
   */
  route(path17, app2) {
    const subApp = this.basePath(path17);
    app2.routes.map((r) => {
      let handler;
      if (app2.errorHandler === errorHandler) {
        handler = r.handler;
      } else {
        handler = async (c, next) => (await compose([], app2.errorHandler)(c, () => r.handler(c, next))).res;
        handler[COMPOSED_HANDLER] = r.handler;
      }
      subApp.#addRoute(r.method, r.path, handler);
    });
    return this;
  }
  /**
   * `.basePath()` allows base paths to be specified.
   *
   * @see {@link https://hono.dev/docs/api/routing#base-path}
   *
   * @param {string} path - base Path
   * @returns {Hono} changed Hono instance
   *
   * @example
   * ```ts
   * const api = new Hono().basePath('/api')
   * ```
   */
  basePath(path17) {
    const subApp = this.#clone();
    subApp._basePath = mergePath(this._basePath, path17);
    return subApp;
  }
  /**
   * `.onError()` handles an error and returns a customized Response.
   *
   * @see {@link https://hono.dev/docs/api/hono#error-handling}
   *
   * @param {ErrorHandler} handler - request Handler for error
   * @returns {Hono} changed Hono instance
   *
   * @example
   * ```ts
   * app.onError((err, c) => {
   *   console.error(`${err}`)
   *   return c.text('Custom Error Message', 500)
   * })
   * ```
   */
  onError = (handler) => {
    this.errorHandler = handler;
    return this;
  };
  /**
   * `.notFound()` allows you to customize a Not Found Response.
   *
   * @see {@link https://hono.dev/docs/api/hono#not-found}
   *
   * @param {NotFoundHandler} handler - request handler for not-found
   * @returns {Hono} changed Hono instance
   *
   * @example
   * ```ts
   * app.notFound((c) => {
   *   return c.text('Custom 404 Message', 404)
   * })
   * ```
   */
  notFound = (handler) => {
    this.#notFoundHandler = handler;
    return this;
  };
  /**
   * `.mount()` allows you to mount applications built with other frameworks into your Hono application.
   *
   * @see {@link https://hono.dev/docs/api/hono#mount}
   *
   * @param {string} path - base Path
   * @param {Function} applicationHandler - other Request Handler
   * @param {MountOptions} [options] - options of `.mount()`
   * @returns {Hono} mounted Hono instance
   *
   * @example
   * ```ts
   * import { Router as IttyRouter } from 'itty-router'
   * import { Hono } from 'hono'
   * // Create itty-router application
   * const ittyRouter = IttyRouter()
   * // GET /itty-router/hello
   * ittyRouter.get('/hello', () => new Response('Hello from itty-router'))
   *
   * const app = new Hono()
   * app.mount('/itty-router', ittyRouter.handle)
   * ```
   *
   * @example
   * ```ts
   * const app = new Hono()
   * // Send the request to another application without modification.
   * app.mount('/app', anotherApp, {
   *   replaceRequest: (req) => req,
   * })
   * ```
   */
  mount(path17, applicationHandler, options) {
    let replaceRequest;
    let optionHandler;
    if (options) {
      if (typeof options === "function") {
        optionHandler = options;
      } else {
        optionHandler = options.optionHandler;
        if (options.replaceRequest === false) {
          replaceRequest = (request) => request;
        } else {
          replaceRequest = options.replaceRequest;
        }
      }
    }
    const getOptions = optionHandler ? (c) => {
      const options2 = optionHandler(c);
      return Array.isArray(options2) ? options2 : [options2];
    } : (c) => {
      let executionContext = void 0;
      try {
        executionContext = c.executionCtx;
      } catch {
      }
      return [c.env, executionContext];
    };
    replaceRequest ||= (() => {
      const mergedPath = mergePath(this._basePath, path17);
      const pathPrefixLength = mergedPath === "/" ? 0 : mergedPath.length;
      return (request) => {
        const url = new URL(request.url);
        url.pathname = url.pathname.slice(pathPrefixLength) || "/";
        return new Request(url, request);
      };
    })();
    const handler = async (c, next) => {
      const res = await applicationHandler(replaceRequest(c.req.raw), ...getOptions(c));
      if (res) {
        return res;
      }
      await next();
    };
    this.#addRoute(METHOD_NAME_ALL, mergePath(path17, "*"), handler);
    return this;
  }
  #addRoute(method, path17, handler) {
    method = method.toUpperCase();
    path17 = mergePath(this._basePath, path17);
    const r = { basePath: this._basePath, path: path17, method, handler };
    this.router.add(method, path17, [handler, r]);
    this.routes.push(r);
  }
  #handleError(err, c) {
    if (err instanceof Error) {
      return this.errorHandler(err, c);
    }
    throw err;
  }
  #dispatch(request, executionCtx, env, method) {
    if (method === "HEAD") {
      return (async () => new Response(null, await this.#dispatch(request, executionCtx, env, "GET")))();
    }
    const path17 = this.getPath(request, { env });
    const matchResult = this.router.match(method, path17);
    const c = new Context(request, {
      path: path17,
      matchResult,
      env,
      executionCtx,
      notFoundHandler: this.#notFoundHandler
    });
    if (matchResult[0].length === 1) {
      let res;
      try {
        res = matchResult[0][0][0][0](c, async () => {
          c.res = await this.#notFoundHandler(c);
        });
      } catch (err) {
        return this.#handleError(err, c);
      }
      return res instanceof Promise ? res.then(
        (resolved) => resolved || (c.finalized ? c.res : this.#notFoundHandler(c))
      ).catch((err) => this.#handleError(err, c)) : res ?? this.#notFoundHandler(c);
    }
    const composed = compose(matchResult[0], this.errorHandler, this.#notFoundHandler);
    return (async () => {
      try {
        const context = await composed(c);
        if (!context.finalized) {
          throw new Error(
            "Context is not finalized. Did you forget to return a Response object or `await next()`?"
          );
        }
        return context.res;
      } catch (err) {
        return this.#handleError(err, c);
      }
    })();
  }
  /**
   * `.fetch()` will be entry point of your app.
   *
   * @see {@link https://hono.dev/docs/api/hono#fetch}
   *
   * @param {Request} request - request Object of request
   * @param {Env} Env - env Object
   * @param {ExecutionContext} - context of execution
   * @returns {Response | Promise<Response>} response of request
   *
   */
  fetch = (request, ...rest) => {
    return this.#dispatch(request, rest[1], rest[0], request.method);
  };
  /**
   * `.request()` is a useful method for testing.
   * You can pass a URL or pathname to send a GET request.
   * app will return a Response object.
   * ```ts
   * test('GET /hello is ok', async () => {
   *   const res = await app.request('/hello')
   *   expect(res.status).toBe(200)
   * })
   * ```
   * @see https://hono.dev/docs/api/hono#request
   */
  request = (input, requestInit, Env, executionCtx) => {
    if (input instanceof Request) {
      return this.fetch(requestInit ? new Request(input, requestInit) : input, Env, executionCtx);
    }
    input = input.toString();
    return this.fetch(
      new Request(
        /^https?:\/\//.test(input) ? input : `http://localhost${mergePath("/", input)}`,
        requestInit
      ),
      Env,
      executionCtx
    );
  };
  /**
   * `.fire()` automatically adds a global fetch event listener.
   * This can be useful for environments that adhere to the Service Worker API, such as non-ES module Cloudflare Workers.
   * @deprecated
   * Use `fire` from `hono/service-worker` instead.
   * ```ts
   * import { Hono } from 'hono'
   * import { fire } from 'hono/service-worker'
   *
   * const app = new Hono()
   * // ...
   * fire(app)
   * ```
   * @see https://hono.dev/docs/api/hono#fire
   * @see https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API
   * @see https://developers.cloudflare.com/workers/reference/migrate-to-module-workers/
   */
  fire = () => {
    addEventListener("fetch", (event) => {
      event.respondWith(this.#dispatch(event.request, event, void 0, event.request.method));
    });
  };
};

// node_modules/hono/dist/router/reg-exp-router/matcher.js
var emptyParam = [];
function match(method, path17) {
  const matchers = this.buildAllMatchers();
  const match2 = ((method2, path22) => {
    const matcher = matchers[method2] || matchers[METHOD_NAME_ALL];
    const staticMatch = matcher[2][path22];
    if (staticMatch) {
      return staticMatch;
    }
    const match3 = path22.match(matcher[0]);
    if (!match3) {
      return [[], emptyParam];
    }
    const index = match3.indexOf("", 1);
    return [matcher[1][index], match3];
  });
  this.match = match2;
  return match2(method, path17);
}

// node_modules/hono/dist/router/reg-exp-router/node.js
var LABEL_REG_EXP_STR = "[^/]+";
var ONLY_WILDCARD_REG_EXP_STR = ".*";
var TAIL_WILDCARD_REG_EXP_STR = "(?:|/.*)";
var PATH_ERROR = /* @__PURE__ */ Symbol();
var regExpMetaChars = new Set(".\\+*[^]$()");
function compareKey(a, b) {
  if (a.length === 1) {
    return b.length === 1 ? a < b ? -1 : 1 : -1;
  }
  if (b.length === 1) {
    return 1;
  }
  if (a === ONLY_WILDCARD_REG_EXP_STR || a === TAIL_WILDCARD_REG_EXP_STR) {
    return 1;
  } else if (b === ONLY_WILDCARD_REG_EXP_STR || b === TAIL_WILDCARD_REG_EXP_STR) {
    return -1;
  }
  if (a === LABEL_REG_EXP_STR) {
    return 1;
  } else if (b === LABEL_REG_EXP_STR) {
    return -1;
  }
  return a.length === b.length ? a < b ? -1 : 1 : b.length - a.length;
}
var Node = class _Node {
  #index;
  #varIndex;
  #children = /* @__PURE__ */ Object.create(null);
  insert(tokens, index, paramMap, context, pathErrorCheckOnly) {
    if (tokens.length === 0) {
      if (this.#index !== void 0) {
        throw PATH_ERROR;
      }
      if (pathErrorCheckOnly) {
        return;
      }
      this.#index = index;
      return;
    }
    const [token, ...restTokens] = tokens;
    const pattern = token === "*" ? restTokens.length === 0 ? ["", "", ONLY_WILDCARD_REG_EXP_STR] : ["", "", LABEL_REG_EXP_STR] : token === "/*" ? ["", "", TAIL_WILDCARD_REG_EXP_STR] : token.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
    let node;
    if (pattern) {
      const name = pattern[1];
      let regexpStr = pattern[2] || LABEL_REG_EXP_STR;
      if (name && pattern[2]) {
        if (regexpStr === ".*") {
          throw PATH_ERROR;
        }
        regexpStr = regexpStr.replace(/^\((?!\?:)(?=[^)]+\)$)/, "(?:");
        if (/\((?!\?:)/.test(regexpStr)) {
          throw PATH_ERROR;
        }
      }
      node = this.#children[regexpStr];
      if (!node) {
        if (Object.keys(this.#children).some(
          (k) => k !== ONLY_WILDCARD_REG_EXP_STR && k !== TAIL_WILDCARD_REG_EXP_STR
        )) {
          throw PATH_ERROR;
        }
        if (pathErrorCheckOnly) {
          return;
        }
        node = this.#children[regexpStr] = new _Node();
        if (name !== "") {
          node.#varIndex = context.varIndex++;
        }
      }
      if (!pathErrorCheckOnly && name !== "") {
        paramMap.push([name, node.#varIndex]);
      }
    } else {
      node = this.#children[token];
      if (!node) {
        if (Object.keys(this.#children).some(
          (k) => k.length > 1 && k !== ONLY_WILDCARD_REG_EXP_STR && k !== TAIL_WILDCARD_REG_EXP_STR
        )) {
          throw PATH_ERROR;
        }
        if (pathErrorCheckOnly) {
          return;
        }
        node = this.#children[token] = new _Node();
      }
    }
    node.insert(restTokens, index, paramMap, context, pathErrorCheckOnly);
  }
  buildRegExpStr() {
    const childKeys = Object.keys(this.#children).sort(compareKey);
    const strList = childKeys.map((k) => {
      const c = this.#children[k];
      return (typeof c.#varIndex === "number" ? `(${k})@${c.#varIndex}` : regExpMetaChars.has(k) ? `\\${k}` : k) + c.buildRegExpStr();
    });
    if (typeof this.#index === "number") {
      strList.unshift(`#${this.#index}`);
    }
    if (strList.length === 0) {
      return "";
    }
    if (strList.length === 1) {
      return strList[0];
    }
    return "(?:" + strList.join("|") + ")";
  }
};

// node_modules/hono/dist/router/reg-exp-router/trie.js
var Trie = class {
  #context = { varIndex: 0 };
  #root = new Node();
  insert(path17, index, pathErrorCheckOnly) {
    const paramAssoc = [];
    const groups = [];
    for (let i = 0; ; ) {
      let replaced = false;
      path17 = path17.replace(/\{[^}]+\}/g, (m) => {
        const mark = `@\\${i}`;
        groups[i] = [mark, m];
        i++;
        replaced = true;
        return mark;
      });
      if (!replaced) {
        break;
      }
    }
    const tokens = path17.match(/(?::[^\/]+)|(?:\/\*$)|./g) || [];
    for (let i = groups.length - 1; i >= 0; i--) {
      const [mark] = groups[i];
      for (let j = tokens.length - 1; j >= 0; j--) {
        if (tokens[j].indexOf(mark) !== -1) {
          tokens[j] = tokens[j].replace(mark, groups[i][1]);
          break;
        }
      }
    }
    this.#root.insert(tokens, index, paramAssoc, this.#context, pathErrorCheckOnly);
    return paramAssoc;
  }
  buildRegExp() {
    let regexp = this.#root.buildRegExpStr();
    if (regexp === "") {
      return [/^$/, [], []];
    }
    let captureIndex = 0;
    const indexReplacementMap = [];
    const paramReplacementMap = [];
    regexp = regexp.replace(/#(\d+)|@(\d+)|\.\*\$/g, (_, handlerIndex, paramIndex) => {
      if (handlerIndex !== void 0) {
        indexReplacementMap[++captureIndex] = Number(handlerIndex);
        return "$()";
      }
      if (paramIndex !== void 0) {
        paramReplacementMap[Number(paramIndex)] = ++captureIndex;
        return "";
      }
      return "";
    });
    return [new RegExp(`^${regexp}`), indexReplacementMap, paramReplacementMap];
  }
};

// node_modules/hono/dist/router/reg-exp-router/router.js
var nullMatcher = [/^$/, [], /* @__PURE__ */ Object.create(null)];
var wildcardRegExpCache = /* @__PURE__ */ Object.create(null);
function buildWildcardRegExp(path17) {
  return wildcardRegExpCache[path17] ??= new RegExp(
    path17 === "*" ? "" : `^${path17.replace(
      /\/\*$|([.\\+*[^\]$()])/g,
      (_, metaChar) => metaChar ? `\\${metaChar}` : "(?:|/.*)"
    )}$`
  );
}
function clearWildcardRegExpCache() {
  wildcardRegExpCache = /* @__PURE__ */ Object.create(null);
}
function buildMatcherFromPreprocessedRoutes(routes) {
  const trie = new Trie();
  const handlerData = [];
  if (routes.length === 0) {
    return nullMatcher;
  }
  const routesWithStaticPathFlag = routes.map(
    (route) => [!/\*|\/:/.test(route[0]), ...route]
  ).sort(
    ([isStaticA, pathA], [isStaticB, pathB]) => isStaticA ? 1 : isStaticB ? -1 : pathA.length - pathB.length
  );
  const staticMap = /* @__PURE__ */ Object.create(null);
  for (let i = 0, j = -1, len = routesWithStaticPathFlag.length; i < len; i++) {
    const [pathErrorCheckOnly, path17, handlers] = routesWithStaticPathFlag[i];
    if (pathErrorCheckOnly) {
      staticMap[path17] = [handlers.map(([h]) => [h, /* @__PURE__ */ Object.create(null)]), emptyParam];
    } else {
      j++;
    }
    let paramAssoc;
    try {
      paramAssoc = trie.insert(path17, j, pathErrorCheckOnly);
    } catch (e) {
      throw e === PATH_ERROR ? new UnsupportedPathError(path17) : e;
    }
    if (pathErrorCheckOnly) {
      continue;
    }
    handlerData[j] = handlers.map(([h, paramCount]) => {
      const paramIndexMap = /* @__PURE__ */ Object.create(null);
      paramCount -= 1;
      for (; paramCount >= 0; paramCount--) {
        const [key, value] = paramAssoc[paramCount];
        paramIndexMap[key] = value;
      }
      return [h, paramIndexMap];
    });
  }
  const [regexp, indexReplacementMap, paramReplacementMap] = trie.buildRegExp();
  for (let i = 0, len = handlerData.length; i < len; i++) {
    for (let j = 0, len2 = handlerData[i].length; j < len2; j++) {
      const map = handlerData[i][j]?.[1];
      if (!map) {
        continue;
      }
      const keys = Object.keys(map);
      for (let k = 0, len3 = keys.length; k < len3; k++) {
        map[keys[k]] = paramReplacementMap[map[keys[k]]];
      }
    }
  }
  const handlerMap = [];
  for (const i in indexReplacementMap) {
    handlerMap[i] = handlerData[indexReplacementMap[i]];
  }
  return [regexp, handlerMap, staticMap];
}
function findMiddleware(middleware, path17) {
  if (!middleware) {
    return void 0;
  }
  for (const k of Object.keys(middleware).sort((a, b) => b.length - a.length)) {
    if (buildWildcardRegExp(k).test(path17)) {
      return [...middleware[k]];
    }
  }
  return void 0;
}
var RegExpRouter = class {
  name = "RegExpRouter";
  #middleware;
  #routes;
  constructor() {
    this.#middleware = { [METHOD_NAME_ALL]: /* @__PURE__ */ Object.create(null) };
    this.#routes = { [METHOD_NAME_ALL]: /* @__PURE__ */ Object.create(null) };
  }
  add(method, path17, handler) {
    const middleware = this.#middleware;
    const routes = this.#routes;
    if (!middleware || !routes) {
      throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
    }
    if (!middleware[method]) {
      ;
      [middleware, routes].forEach((handlerMap) => {
        handlerMap[method] = /* @__PURE__ */ Object.create(null);
        Object.keys(handlerMap[METHOD_NAME_ALL]).forEach((p) => {
          handlerMap[method][p] = [...handlerMap[METHOD_NAME_ALL][p]];
        });
      });
    }
    if (path17 === "/*") {
      path17 = "*";
    }
    const paramCount = (path17.match(/\/:/g) || []).length;
    if (/\*$/.test(path17)) {
      const re = buildWildcardRegExp(path17);
      if (method === METHOD_NAME_ALL) {
        Object.keys(middleware).forEach((m) => {
          middleware[m][path17] ||= findMiddleware(middleware[m], path17) || findMiddleware(middleware[METHOD_NAME_ALL], path17) || [];
        });
      } else {
        middleware[method][path17] ||= findMiddleware(middleware[method], path17) || findMiddleware(middleware[METHOD_NAME_ALL], path17) || [];
      }
      Object.keys(middleware).forEach((m) => {
        if (method === METHOD_NAME_ALL || method === m) {
          Object.keys(middleware[m]).forEach((p) => {
            re.test(p) && middleware[m][p].push([handler, paramCount]);
          });
        }
      });
      Object.keys(routes).forEach((m) => {
        if (method === METHOD_NAME_ALL || method === m) {
          Object.keys(routes[m]).forEach(
            (p) => re.test(p) && routes[m][p].push([handler, paramCount])
          );
        }
      });
      return;
    }
    const paths = checkOptionalParameter(path17) || [path17];
    for (let i = 0, len = paths.length; i < len; i++) {
      const path22 = paths[i];
      Object.keys(routes).forEach((m) => {
        if (method === METHOD_NAME_ALL || method === m) {
          routes[m][path22] ||= [
            ...findMiddleware(middleware[m], path22) || findMiddleware(middleware[METHOD_NAME_ALL], path22) || []
          ];
          routes[m][path22].push([handler, paramCount - len + i + 1]);
        }
      });
    }
  }
  match = match;
  buildAllMatchers() {
    const matchers = /* @__PURE__ */ Object.create(null);
    Object.keys(this.#routes).concat(Object.keys(this.#middleware)).forEach((method) => {
      matchers[method] ||= this.#buildMatcher(method);
    });
    this.#middleware = this.#routes = void 0;
    clearWildcardRegExpCache();
    return matchers;
  }
  #buildMatcher(method) {
    const routes = [];
    let hasOwnRoute = method === METHOD_NAME_ALL;
    [this.#middleware, this.#routes].forEach((r) => {
      const ownRoute = r[method] ? Object.keys(r[method]).map((path17) => [path17, r[method][path17]]) : [];
      if (ownRoute.length !== 0) {
        hasOwnRoute ||= true;
        routes.push(...ownRoute);
      } else if (method !== METHOD_NAME_ALL) {
        routes.push(
          ...Object.keys(r[METHOD_NAME_ALL]).map((path17) => [path17, r[METHOD_NAME_ALL][path17]])
        );
      }
    });
    if (!hasOwnRoute) {
      return null;
    } else {
      return buildMatcherFromPreprocessedRoutes(routes);
    }
  }
};

// node_modules/hono/dist/router/smart-router/router.js
var SmartRouter = class {
  name = "SmartRouter";
  #routers = [];
  #routes = [];
  constructor(init) {
    this.#routers = init.routers;
  }
  add(method, path17, handler) {
    if (!this.#routes) {
      throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
    }
    this.#routes.push([method, path17, handler]);
  }
  match(method, path17) {
    if (!this.#routes) {
      throw new Error("Fatal error");
    }
    const routers = this.#routers;
    const routes = this.#routes;
    const len = routers.length;
    let i = 0;
    let res;
    for (; i < len; i++) {
      const router = routers[i];
      try {
        for (let i2 = 0, len2 = routes.length; i2 < len2; i2++) {
          router.add(...routes[i2]);
        }
        res = router.match(method, path17);
      } catch (e) {
        if (e instanceof UnsupportedPathError) {
          continue;
        }
        throw e;
      }
      this.match = router.match.bind(router);
      this.#routers = [router];
      this.#routes = void 0;
      break;
    }
    if (i === len) {
      throw new Error("Fatal error");
    }
    this.name = `SmartRouter + ${this.activeRouter.name}`;
    return res;
  }
  get activeRouter() {
    if (this.#routes || this.#routers.length !== 1) {
      throw new Error("No active router has been determined yet.");
    }
    return this.#routers[0];
  }
};

// node_modules/hono/dist/router/trie-router/node.js
var emptyParams = /* @__PURE__ */ Object.create(null);
var Node2 = class _Node2 {
  #methods;
  #children;
  #patterns;
  #order = 0;
  #params = emptyParams;
  constructor(method, handler, children) {
    this.#children = children || /* @__PURE__ */ Object.create(null);
    this.#methods = [];
    if (method && handler) {
      const m = /* @__PURE__ */ Object.create(null);
      m[method] = { handler, possibleKeys: [], score: 0 };
      this.#methods = [m];
    }
    this.#patterns = [];
  }
  insert(method, path17, handler) {
    this.#order = ++this.#order;
    let curNode = this;
    const parts = splitRoutingPath(path17);
    const possibleKeys = [];
    for (let i = 0, len = parts.length; i < len; i++) {
      const p = parts[i];
      const nextP = parts[i + 1];
      const pattern = getPattern(p, nextP);
      const key = Array.isArray(pattern) ? pattern[0] : p;
      if (key in curNode.#children) {
        curNode = curNode.#children[key];
        if (pattern) {
          possibleKeys.push(pattern[1]);
        }
        continue;
      }
      curNode.#children[key] = new _Node2();
      if (pattern) {
        curNode.#patterns.push(pattern);
        possibleKeys.push(pattern[1]);
      }
      curNode = curNode.#children[key];
    }
    curNode.#methods.push({
      [method]: {
        handler,
        possibleKeys: possibleKeys.filter((v, i, a) => a.indexOf(v) === i),
        score: this.#order
      }
    });
    return curNode;
  }
  #getHandlerSets(node, method, nodeParams, params) {
    const handlerSets = [];
    for (let i = 0, len = node.#methods.length; i < len; i++) {
      const m = node.#methods[i];
      const handlerSet = m[method] || m[METHOD_NAME_ALL];
      const processedSet = {};
      if (handlerSet !== void 0) {
        handlerSet.params = /* @__PURE__ */ Object.create(null);
        handlerSets.push(handlerSet);
        if (nodeParams !== emptyParams || params && params !== emptyParams) {
          for (let i2 = 0, len2 = handlerSet.possibleKeys.length; i2 < len2; i2++) {
            const key = handlerSet.possibleKeys[i2];
            const processed = processedSet[handlerSet.score];
            handlerSet.params[key] = params?.[key] && !processed ? params[key] : nodeParams[key] ?? params?.[key];
            processedSet[handlerSet.score] = true;
          }
        }
      }
    }
    return handlerSets;
  }
  search(method, path17) {
    const handlerSets = [];
    this.#params = emptyParams;
    const curNode = this;
    let curNodes = [curNode];
    const parts = splitPath(path17);
    const curNodesQueue = [];
    for (let i = 0, len = parts.length; i < len; i++) {
      const part = parts[i];
      const isLast = i === len - 1;
      const tempNodes = [];
      for (let j = 0, len2 = curNodes.length; j < len2; j++) {
        const node = curNodes[j];
        const nextNode = node.#children[part];
        if (nextNode) {
          nextNode.#params = node.#params;
          if (isLast) {
            if (nextNode.#children["*"]) {
              handlerSets.push(
                ...this.#getHandlerSets(nextNode.#children["*"], method, node.#params)
              );
            }
            handlerSets.push(...this.#getHandlerSets(nextNode, method, node.#params));
          } else {
            tempNodes.push(nextNode);
          }
        }
        for (let k = 0, len3 = node.#patterns.length; k < len3; k++) {
          const pattern = node.#patterns[k];
          const params = node.#params === emptyParams ? {} : { ...node.#params };
          if (pattern === "*") {
            const astNode = node.#children["*"];
            if (astNode) {
              handlerSets.push(...this.#getHandlerSets(astNode, method, node.#params));
              astNode.#params = params;
              tempNodes.push(astNode);
            }
            continue;
          }
          const [key, name, matcher] = pattern;
          if (!part && !(matcher instanceof RegExp)) {
            continue;
          }
          const child = node.#children[key];
          const restPathString = parts.slice(i).join("/");
          if (matcher instanceof RegExp) {
            const m = matcher.exec(restPathString);
            if (m) {
              params[name] = m[0];
              handlerSets.push(...this.#getHandlerSets(child, method, node.#params, params));
              if (Object.keys(child.#children).length) {
                child.#params = params;
                const componentCount = m[0].match(/\//)?.length ?? 0;
                const targetCurNodes = curNodesQueue[componentCount] ||= [];
                targetCurNodes.push(child);
              }
              continue;
            }
          }
          if (matcher === true || matcher.test(part)) {
            params[name] = part;
            if (isLast) {
              handlerSets.push(...this.#getHandlerSets(child, method, params, node.#params));
              if (child.#children["*"]) {
                handlerSets.push(
                  ...this.#getHandlerSets(child.#children["*"], method, params, node.#params)
                );
              }
            } else {
              child.#params = params;
              tempNodes.push(child);
            }
          }
        }
      }
      curNodes = tempNodes.concat(curNodesQueue.shift() ?? []);
    }
    if (handlerSets.length > 1) {
      handlerSets.sort((a, b) => {
        return a.score - b.score;
      });
    }
    return [handlerSets.map(({ handler, params }) => [handler, params])];
  }
};

// node_modules/hono/dist/router/trie-router/router.js
var TrieRouter = class {
  name = "TrieRouter";
  #node;
  constructor() {
    this.#node = new Node2();
  }
  add(method, path17, handler) {
    const results = checkOptionalParameter(path17);
    if (results) {
      for (let i = 0, len = results.length; i < len; i++) {
        this.#node.insert(method, results[i], handler);
      }
      return;
    }
    this.#node.insert(method, path17, handler);
  }
  match(method, path17) {
    return this.#node.search(method, path17);
  }
};

// node_modules/hono/dist/hono.js
var Hono2 = class extends Hono {
  /**
   * Creates an instance of the Hono class.
   *
   * @param options - Optional configuration options for the Hono instance.
   */
  constructor(options = {}) {
    super(options);
    this.router = options.router ?? new SmartRouter({
      routers: [new RegExpRouter(), new TrieRouter()]
    });
  }
};

// node_modules/hono/dist/middleware/cors/index.js
var cors = (options) => {
  const defaults = {
    origin: "*",
    allowMethods: ["GET", "HEAD", "PUT", "POST", "DELETE", "PATCH"],
    allowHeaders: [],
    exposeHeaders: []
  };
  const opts = {
    ...defaults,
    ...options
  };
  const findAllowOrigin = ((optsOrigin) => {
    if (typeof optsOrigin === "string") {
      if (optsOrigin === "*") {
        return () => optsOrigin;
      } else {
        return (origin) => optsOrigin === origin ? origin : null;
      }
    } else if (typeof optsOrigin === "function") {
      return optsOrigin;
    } else {
      return (origin) => optsOrigin.includes(origin) ? origin : null;
    }
  })(opts.origin);
  const findAllowMethods = ((optsAllowMethods) => {
    if (typeof optsAllowMethods === "function") {
      return optsAllowMethods;
    } else if (Array.isArray(optsAllowMethods)) {
      return () => optsAllowMethods;
    } else {
      return () => [];
    }
  })(opts.allowMethods);
  return async function cors2(c, next) {
    function set(key, value) {
      c.res.headers.set(key, value);
    }
    const allowOrigin = await findAllowOrigin(c.req.header("origin") || "", c);
    if (allowOrigin) {
      set("Access-Control-Allow-Origin", allowOrigin);
    }
    if (opts.credentials) {
      set("Access-Control-Allow-Credentials", "true");
    }
    if (opts.exposeHeaders?.length) {
      set("Access-Control-Expose-Headers", opts.exposeHeaders.join(","));
    }
    if (c.req.method === "OPTIONS") {
      if (opts.origin !== "*") {
        set("Vary", "Origin");
      }
      if (opts.maxAge != null) {
        set("Access-Control-Max-Age", opts.maxAge.toString());
      }
      const allowMethods = await findAllowMethods(c.req.header("origin") || "", c);
      if (allowMethods.length) {
        set("Access-Control-Allow-Methods", allowMethods.join(","));
      }
      let headers = opts.allowHeaders;
      if (!headers?.length) {
        const requestHeaders = c.req.header("Access-Control-Request-Headers");
        if (requestHeaders) {
          headers = requestHeaders.split(/\s*,\s*/);
        }
      }
      if (headers?.length) {
        set("Access-Control-Allow-Headers", headers.join(","));
        c.res.headers.append("Vary", "Access-Control-Request-Headers");
      }
      c.res.headers.delete("Content-Length");
      c.res.headers.delete("Content-Type");
      return new Response(null, {
        headers: c.res.headers,
        status: 204,
        statusText: "No Content"
      });
    }
    await next();
    if (opts.origin !== "*") {
      c.header("Vary", "Origin", { append: true });
    }
  };
};

// lib/index/manager.ts
import * as fs3 from "node:fs";
import * as path2 from "node:path";

// lib/utils.ts
import * as fs from "node:fs";
function safeReadJson(filePath, fallback) {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content);
  } catch {
    return fallback;
  }
}
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// lib/index/builder.ts
import * as fs2 from "node:fs";
import * as path from "node:path";
function listMonthJsonFiles(monthDir) {
  if (!fs2.existsSync(monthDir)) {
    return [];
  }
  const files = [];
  const entries = fs2.readdirSync(monthDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(path.join(monthDir, entry.name));
    }
  }
  return files;
}
function listYearMonths(dir) {
  if (!fs2.existsSync(dir)) {
    return [];
  }
  const results = [];
  const years = fs2.readdirSync(dir, { withFileTypes: true });
  for (const year of years) {
    if (!year.isDirectory() || !/^\d{4}$/.test(year.name)) continue;
    const yearPath = path.join(dir, year.name);
    const months = fs2.readdirSync(yearPath, { withFileTypes: true });
    for (const month of months) {
      if (!month.isDirectory() || !/^\d{2}$/.test(month.name)) continue;
      results.push({ year: year.name, month: month.name });
    }
  }
  results.sort((a, b) => {
    const aKey = `${a.year}${a.month}`;
    const bKey = `${b.year}${b.month}`;
    return bKey.localeCompare(aKey);
  });
  return results;
}
function buildSessionIndexForMonth(mnemeDir2, year, month) {
  const sessionsDir = path.join(mnemeDir2, "sessions");
  const monthDir = path.join(sessionsDir, year, month);
  const files = listMonthJsonFiles(monthDir);
  const items = [];
  for (const filePath of files) {
    try {
      const session = safeReadJson(filePath, {});
      if (!session.id || !session.createdAt) continue;
      const relativePath = path.relative(sessionsDir, filePath);
      const interactions = session.interactions || [];
      const context = session.context || {};
      const user = context.user;
      const summary = session.summary || {};
      const title = summary.title || session.title || "";
      const sessionType = session.sessionType || summary.sessionType || null;
      items.push({
        id: session.id,
        sessionId: session.sessionId || void 0,
        title: title || "Untitled",
        goal: summary.goal || session.goal || void 0,
        createdAt: session.createdAt,
        tags: session.tags || [],
        sessionType,
        branch: context.branch || null,
        user: user?.name,
        interactionCount: interactions.length,
        filePath: relativePath,
        hasSummary: !!title && title !== "Untitled"
      });
    } catch {
    }
  }
  items.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  return {
    version: 1,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    items
  };
}
function buildAllSessionIndexes(mnemeDir2) {
  const sessionsDir = path.join(mnemeDir2, "sessions");
  const yearMonths = listYearMonths(sessionsDir);
  const indexes = /* @__PURE__ */ new Map();
  for (const { year, month } of yearMonths) {
    const key = `${year}/${month}`;
    const index = buildSessionIndexForMonth(mnemeDir2, year, month);
    if (index.items.length > 0) {
      indexes.set(key, index);
    }
  }
  return indexes;
}
function buildDecisionIndexForMonth(mnemeDir2, year, month) {
  const decisionsDir = path.join(mnemeDir2, "decisions");
  const monthDir = path.join(decisionsDir, year, month);
  const files = listMonthJsonFiles(monthDir);
  const items = [];
  for (const filePath of files) {
    try {
      const decision = safeReadJson(filePath, {});
      if (!decision.id || !decision.createdAt) continue;
      const relativePath = path.relative(decisionsDir, filePath);
      const user = decision.user;
      items.push({
        id: decision.id,
        title: decision.title || "Untitled",
        createdAt: decision.createdAt,
        updatedAt: decision.updatedAt,
        tags: decision.tags || [],
        status: decision.status || "active",
        user: user?.name,
        filePath: relativePath
      });
    } catch {
    }
  }
  items.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  return {
    version: 1,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    items
  };
}
function buildAllDecisionIndexes(mnemeDir2) {
  const decisionsDir = path.join(mnemeDir2, "decisions");
  const yearMonths = listYearMonths(decisionsDir);
  const indexes = /* @__PURE__ */ new Map();
  for (const { year, month } of yearMonths) {
    const key = `${year}/${month}`;
    const index = buildDecisionIndexForMonth(mnemeDir2, year, month);
    if (index.items.length > 0) {
      indexes.set(key, index);
    }
  }
  return indexes;
}
function getSessionYearMonths(mnemeDir2) {
  const sessionsDir = path.join(mnemeDir2, "sessions");
  return listYearMonths(sessionsDir);
}
function getDecisionYearMonths(mnemeDir2) {
  const decisionsDir = path.join(mnemeDir2, "decisions");
  return listYearMonths(decisionsDir);
}

// lib/index/manager.ts
var INDEXES_DIR = ".indexes";
function getIndexDir(mnemeDir2) {
  return path2.join(mnemeDir2, INDEXES_DIR);
}
function getSessionIndexPath(mnemeDir2, year, month) {
  return path2.join(getIndexDir(mnemeDir2), "sessions", year, `${month}.json`);
}
function getDecisionIndexPath(mnemeDir2, year, month) {
  return path2.join(getIndexDir(mnemeDir2), "decisions", year, `${month}.json`);
}
function readSessionIndexForMonth(mnemeDir2, year, month) {
  const indexPath = getSessionIndexPath(mnemeDir2, year, month);
  if (!fs3.existsSync(indexPath)) {
    return null;
  }
  return safeReadJson(indexPath, {
    version: 1,
    updatedAt: "",
    items: []
  });
}
function readDecisionIndexForMonth(mnemeDir2, year, month) {
  const indexPath = getDecisionIndexPath(mnemeDir2, year, month);
  if (!fs3.existsSync(indexPath)) {
    return null;
  }
  return safeReadJson(indexPath, {
    version: 1,
    updatedAt: "",
    items: []
  });
}
function writeSessionIndexForMonth(mnemeDir2, year, month, index) {
  const indexPath = getSessionIndexPath(mnemeDir2, year, month);
  ensureDir(path2.dirname(indexPath));
  fs3.writeFileSync(indexPath, JSON.stringify(index, null, 2));
}
function writeDecisionIndexForMonth(mnemeDir2, year, month, index) {
  const indexPath = getDecisionIndexPath(mnemeDir2, year, month);
  ensureDir(path2.dirname(indexPath));
  fs3.writeFileSync(indexPath, JSON.stringify(index, null, 2));
}
function rebuildSessionIndexForMonth(mnemeDir2, year, month) {
  const index = buildSessionIndexForMonth(mnemeDir2, year, month);
  if (index.items.length > 0) {
    writeSessionIndexForMonth(mnemeDir2, year, month, index);
  } else {
    const indexPath = getSessionIndexPath(mnemeDir2, year, month);
    if (fs3.existsSync(indexPath)) fs3.unlinkSync(indexPath);
  }
  return index;
}
function rebuildDecisionIndexForMonth(mnemeDir2, year, month) {
  const index = buildDecisionIndexForMonth(mnemeDir2, year, month);
  if (index.items.length > 0) {
    writeDecisionIndexForMonth(mnemeDir2, year, month, index);
  } else {
    const indexPath = getDecisionIndexPath(mnemeDir2, year, month);
    if (fs3.existsSync(indexPath)) fs3.unlinkSync(indexPath);
  }
  return index;
}
function rebuildAllSessionIndexes(mnemeDir2) {
  const allIndexes = buildAllSessionIndexes(mnemeDir2);
  for (const [key, index] of allIndexes) {
    const [year, month] = key.split("/");
    writeSessionIndexForMonth(mnemeDir2, year, month, index);
  }
  return allIndexes;
}
function rebuildAllDecisionIndexes(mnemeDir2) {
  const allIndexes = buildAllDecisionIndexes(mnemeDir2);
  for (const [key, index] of allIndexes) {
    const [year, month] = key.split("/");
    writeDecisionIndexForMonth(mnemeDir2, year, month, index);
  }
  return allIndexes;
}
function readRecentSessionIndexes(mnemeDir2, monthCount = 6) {
  const yearMonths = getSessionYearMonths(mnemeDir2);
  const recentMonths = yearMonths.slice(0, monthCount);
  const allItems = [];
  let latestUpdate = "";
  for (const { year, month } of recentMonths) {
    let index = readSessionIndexForMonth(mnemeDir2, year, month);
    if (!index || isIndexStale(index)) {
      index = rebuildSessionIndexForMonth(mnemeDir2, year, month);
    }
    if (index.items.length > 0) {
      allItems.push(...index.items);
      if (index.updatedAt > latestUpdate) {
        latestUpdate = index.updatedAt;
      }
    }
  }
  allItems.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  return {
    version: 1,
    updatedAt: latestUpdate || (/* @__PURE__ */ new Date()).toISOString(),
    items: allItems
  };
}
function readRecentDecisionIndexes(mnemeDir2, monthCount = 6) {
  const yearMonths = getDecisionYearMonths(mnemeDir2);
  const recentMonths = yearMonths.slice(0, monthCount);
  const allItems = [];
  let latestUpdate = "";
  for (const { year, month } of recentMonths) {
    let index = readDecisionIndexForMonth(mnemeDir2, year, month);
    if (!index || isIndexStale(index)) {
      index = rebuildDecisionIndexForMonth(mnemeDir2, year, month);
    }
    if (index.items.length > 0) {
      allItems.push(...index.items);
      if (index.updatedAt > latestUpdate) {
        latestUpdate = index.updatedAt;
      }
    }
  }
  allItems.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  return {
    version: 1,
    updatedAt: latestUpdate || (/* @__PURE__ */ new Date()).toISOString(),
    items: allItems
  };
}
function readAllSessionIndexes(mnemeDir2) {
  return readRecentSessionIndexes(mnemeDir2, Number.MAX_SAFE_INTEGER);
}
function readAllDecisionIndexes(mnemeDir2) {
  return readRecentDecisionIndexes(mnemeDir2, Number.MAX_SAFE_INTEGER);
}
function isIndexStale(index, maxAgeMs = 5 * 60 * 1e3) {
  if (!index || !index.updatedAt) {
    return true;
  }
  const updatedAt = new Date(index.updatedAt).getTime();
  const now = Date.now();
  return now - updatedAt > maxAgeMs;
}

// dashboard/server/lib/helpers.ts
import fs4 from "node:fs";
import path3 from "node:path";

// lib/db/index.ts
import { execSync } from "node:child_process";

// lib/suppress-sqlite-warning.ts
var originalEmit = process.emit;
process.emit = (event, ...args) => {
  if (event === "warning" && typeof args[0] === "object" && args[0] !== null && "name" in args[0] && args[0].name === "ExperimentalWarning" && "message" in args[0] && typeof args[0].message === "string" && args[0].message.includes("SQLite")) {
    return false;
  }
  return originalEmit.apply(process, [event, ...args]);
};

// lib/db/init.ts
import { existsSync as existsSync5, mkdirSync as mkdirSync2, readFileSync as readFileSync2 } from "node:fs";
import { dirname as dirname2, join as join4 } from "node:path";
import { fileURLToPath } from "node:url";
var { DatabaseSync } = await import("node:sqlite");
var __filename = fileURLToPath(import.meta.url);
var __dirname = dirname2(__filename);
function getLocalDbPath(projectPath) {
  return join4(projectPath, ".mneme", "local.db");
}
function configurePragmas(db) {
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec("PRAGMA synchronous = NORMAL");
}
function openLocalDatabase(projectPath) {
  const dbPath = getLocalDbPath(projectPath);
  if (!existsSync5(dbPath)) {
    return null;
  }
  const db = new DatabaseSync(dbPath);
  configurePragmas(db);
  return db;
}

// lib/db/mutations.ts
var { DatabaseSync: DatabaseSync2 } = await import("node:sqlite");
function deleteInteractions(db, sessionId) {
  const stmt = db.prepare("DELETE FROM interactions WHERE session_id = ?");
  stmt.run(sessionId);
}
function deleteBackups(db, sessionId) {
  const stmt = db.prepare(
    "DELETE FROM pre_compact_backups WHERE session_id = ?"
  );
  stmt.run(sessionId);
}

// lib/db/queries.ts
var { DatabaseSync: DatabaseSync3 } = await import("node:sqlite");
function getInteractionsBySessionIds(db, sessionIds) {
  if (sessionIds.length === 0) return [];
  const placeholders = sessionIds.map(() => "?").join(", ");
  const stmt = db.prepare(`
    SELECT * FROM interactions
    WHERE session_id IN (${placeholders})
    ORDER BY timestamp ASC, id ASC
  `);
  return stmt.all(...sessionIds);
}
function getInteractionsByClaudeSessionIds(db, claudeSessionIds) {
  if (claudeSessionIds.length === 0) return [];
  const placeholders = claudeSessionIds.map(() => "?").join(", ");
  const stmt = db.prepare(`
    SELECT * FROM interactions
    WHERE claude_session_id IN (${placeholders})
    ORDER BY timestamp ASC, id ASC
  `);
  return stmt.all(...claudeSessionIds);
}
function countInteractions(db, filter) {
  const conditions = [];
  const params = [];
  if (filter.sessionId) {
    conditions.push("session_id = ?");
    params.push(filter.sessionId);
  }
  if (filter.projectPath) {
    conditions.push("project_path = ?");
    params.push(filter.projectPath);
  }
  if (filter.repository) {
    conditions.push("repository = ?");
    params.push(filter.repository);
  }
  if (filter.before) {
    conditions.push("timestamp < ?");
    params.push(filter.before);
  }
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const stmt = db.prepare(
    `SELECT COUNT(*) as count FROM interactions ${whereClause}`
  );
  const result = stmt.get(...params);
  return result.count;
}

// lib/db/index.ts
function getCurrentUser() {
  try {
    return execSync("git config user.name", { encoding: "utf-8" }).trim();
  } catch {
    try {
      return execSync("whoami", { encoding: "utf-8" }).trim();
    } catch {
      return "unknown";
    }
  }
}

// dashboard/server/lib/helpers.ts
function sanitizeId(id) {
  const normalized = decodeURIComponent(id).trim();
  if (!normalized) return "";
  if (normalized.includes("..") || normalized.includes("/") || normalized.includes("\\")) {
    return "";
  }
  return /^[a-zA-Z0-9:_-]+$/.test(normalized) ? normalized : "";
}
function safeParseJsonFile(filePath) {
  try {
    return JSON.parse(fs4.readFileSync(filePath, "utf-8"));
  } catch (error) {
    console.error(`Failed to parse JSON: ${filePath}`, error);
    return null;
  }
}
var getProjectRoot = () => {
  return process.env.MNEME_PROJECT_ROOT || process.cwd();
};
var getMnemeDir = () => {
  return path3.join(getProjectRoot(), ".mneme");
};
var ALLOWED_RULE_FILES = /* @__PURE__ */ new Set(["dev-rules", "review-guidelines"]);
var listJsonFiles = (dir) => {
  if (!fs4.existsSync(dir)) {
    return [];
  }
  const entries = fs4.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path3.join(dir, entry.name);
    if (entry.isDirectory()) {
      return listJsonFiles(fullPath);
    }
    if (entry.isFile() && entry.name.endsWith(".json")) {
      return [fullPath];
    }
    return [];
  });
};
function writeAuditLog(entry) {
  try {
    const now = /* @__PURE__ */ new Date();
    const auditDir = path3.join(getMnemeDir(), "audit");
    fs4.mkdirSync(auditDir, { recursive: true });
    const auditFile = path3.join(
      auditDir,
      `${now.toISOString().slice(0, 10)}.jsonl`
    );
    const payload = {
      timestamp: now.toISOString(),
      actor: getCurrentUser(),
      ...entry
    };
    fs4.appendFileSync(auditFile, `${JSON.stringify(payload)}
`);
  } catch (error) {
    console.error("Failed to write audit log:", error);
  }
}
var listDatedJsonFiles = (dir) => {
  const files = listJsonFiles(dir);
  return files.filter((filePath) => {
    const rel = path3.relative(dir, filePath);
    const parts = rel.split(path3.sep);
    if (parts.length < 3) {
      return false;
    }
    return /^\d{4}$/.test(parts[0]) && /^\d{2}$/.test(parts[1]);
  });
};
var toShortId = (id) => {
  if (id.length === 36 && id[8] === "-") {
    return id.slice(0, 8);
  }
  return id;
};
var findJsonFileById = (dir, id) => {
  const targets = [
    `${id}.json`,
    ...id !== toShortId(id) ? [`${toShortId(id)}.json`] : []
  ];
  const queue = [dir];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || !fs4.existsSync(current)) {
      continue;
    }
    const entries = fs4.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path3.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
      } else if (entry.isFile() && targets.includes(entry.name)) {
        const rel = path3.relative(dir, fullPath);
        const parts = rel.split(path3.sep);
        if (parts.length >= 3 && /^\d{4}$/.test(parts[0]) && /^\d{2}$/.test(parts[1])) {
          return fullPath;
        }
      }
    }
  }
  return null;
};
var rulesDir = () => path3.join(getMnemeDir(), "rules");
var patternsDir = () => path3.join(getMnemeDir(), "patterns");

// dashboard/server/routes/analytics.ts
import fs7 from "node:fs";
import path6 from "node:path";

// dashboard/server/routes/analytics-graph.ts
import fs6 from "node:fs";
import path5 from "node:path";

// dashboard/server/routes/dev-rules.ts
import fs5 from "node:fs";
import path4 from "node:path";
function collectDevRules() {
  const items = [];
  const decisionFiles = listDatedJsonFiles(
    path4.join(getMnemeDir(), "decisions")
  );
  for (const filePath of decisionFiles) {
    const sourceName = path4.basename(filePath, ".json");
    const raw2 = safeParseJsonFile(filePath);
    if (!raw2) continue;
    const entries = [];
    if (Array.isArray(raw2.items)) {
      entries.push(...raw2.items);
    } else if (raw2.id) {
      entries.push(raw2);
    }
    for (const entry of entries) {
      const id = String(entry.id || "");
      if (!id) continue;
      const alts = Array.isArray(entry.alternatives) ? entry.alternatives.map(
        (a) => typeof a === "string" ? a : String(a.option || a.name || a)
      ) : void 0;
      items.push({
        id,
        type: "decision",
        title: String(entry.title || entry.text || id),
        summary: String(
          entry.text || entry.decision || entry.reasoning || entry.title || ""
        ),
        tags: Array.isArray(entry.tags) ? entry.tags.map((t) => String(t)) : [],
        status: entry.status || "draft",
        priority: entry.priority ? String(entry.priority) : void 0,
        sourceFile: sourceName,
        createdAt: String(entry.createdAt || raw2.createdAt || ""),
        updatedAt: entry.updatedAt ? String(entry.updatedAt) : void 0,
        context: entry.context ? String(entry.context) : void 0,
        reasoning: entry.reasoning ? String(entry.reasoning) : void 0,
        alternatives: alts,
        relatedSessions: Array.isArray(entry.relatedSessions) ? entry.relatedSessions.map((s) => String(s)) : void 0
      });
    }
  }
  const patternFiles = listJsonFiles(patternsDir());
  for (const filePath of patternFiles) {
    const sourceName = path4.basename(filePath, ".json");
    const doc = safeParseJsonFile(filePath);
    const entries = doc?.items || doc?.patterns || [];
    for (const entry of entries) {
      const id = String(entry.id || "");
      if (!id) continue;
      items.push({
        id,
        type: "pattern",
        title: String(
          entry.title || entry.errorPattern || entry.description || id
        ),
        summary: String(
          entry.solution || entry.description || entry.errorPattern || ""
        ),
        tags: Array.isArray(entry.tags) ? entry.tags.map((t) => String(t)) : [sourceName],
        status: entry.status || "draft",
        priority: entry.priority ? String(entry.priority) : void 0,
        sourceFile: sourceName,
        createdAt: String(entry.createdAt || ""),
        updatedAt: entry.updatedAt ? String(entry.updatedAt) : void 0,
        context: entry.context ? String(entry.context) : void 0,
        patternType: entry.type ? String(entry.type) : void 0,
        pattern: entry.pattern ? String(entry.pattern) : void 0,
        sourceId: entry.sourceId ? String(entry.sourceId) : void 0
      });
    }
  }
  const ruleFileNames = ["dev-rules", "review-guidelines"];
  for (const ruleFile of ruleFileNames) {
    const filePath = path4.join(rulesDir(), `${ruleFile}.json`);
    const doc = safeParseJsonFile(filePath);
    if (!doc || !Array.isArray(doc.items)) continue;
    for (const entry of doc.items) {
      const id = String(entry.id || "");
      if (!id) continue;
      const sourceRef = entry.sourceRef && typeof entry.sourceRef === "object" && !Array.isArray(entry.sourceRef) ? {
        type: String(
          entry.sourceRef.type || ""
        ),
        id: String(entry.sourceRef.id || "")
      } : void 0;
      items.push({
        id,
        type: "rule",
        title: String(entry.text || entry.title || entry.rule || id),
        summary: String(entry.rationale || entry.description || ""),
        tags: Array.isArray(entry.tags) ? entry.tags.map((t) => String(t)) : [ruleFile],
        status: entry.status || "draft",
        priority: entry.priority ? String(entry.priority) : void 0,
        sourceFile: ruleFile,
        createdAt: String(entry.createdAt || doc.createdAt || ""),
        updatedAt: entry.updatedAt ? String(entry.updatedAt) : void 0,
        rationale: entry.rationale ? String(entry.rationale) : void 0,
        category: entry.category ? String(entry.category) : void 0,
        sourceRef,
        appliedCount: typeof entry.appliedCount === "number" ? entry.appliedCount : void 0,
        acceptedCount: typeof entry.acceptedCount === "number" ? entry.acceptedCount : void 0
      });
    }
  }
  return items;
}
var devRules = new Hono2();
devRules.get("/", async (c) => {
  try {
    const status = c.req.query("status");
    const items = collectDevRules();
    const filtered = status && ["draft", "approved", "rejected"].includes(status) ? items.filter((item) => item.status === status) : items;
    return c.json({
      items: filtered,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
  } catch (error) {
    console.error("Failed to read dev rules:", error);
    return c.json({ error: "Failed to read dev rules" }, 500);
  }
});
devRules.patch("/:type/:sourceFile/:id/status", async (c) => {
  const type = c.req.param("type");
  const sourceFile = c.req.param("sourceFile");
  const id = sanitizeId(c.req.param("id"));
  const body = await c.req.json();
  if (!id || !sourceFile) {
    return c.json({ error: "Invalid parameters" }, 400);
  }
  if (!body.status || !["draft", "approved", "rejected"].includes(body.status)) {
    return c.json({ error: "Invalid status" }, 400);
  }
  try {
    let filePath;
    if (type === "decision") {
      const found = findJsonFileById(
        path4.join(getMnemeDir(), "decisions"),
        sourceFile
      );
      if (!found) return c.json({ error: "Source file not found" }, 404);
      filePath = found;
    } else if (type === "pattern") {
      filePath = path4.join(patternsDir(), `${sourceFile}.json`);
    } else {
      filePath = path4.join(rulesDir(), `${sourceFile}.json`);
    }
    if (!fs5.existsSync(filePath)) {
      return c.json({ error: "Source file not found" }, 404);
    }
    const raw2 = JSON.parse(fs5.readFileSync(filePath, "utf-8"));
    const items = raw2.items || raw2.patterns || (raw2.id ? [raw2] : []);
    const target = items.find((item) => String(item.id) === id);
    if (!target) {
      return c.json({ error: "Item not found" }, 404);
    }
    target.status = body.status;
    target.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    if (!raw2.items && !raw2.patterns && raw2.id) {
      Object.assign(raw2, target);
    }
    fs5.writeFileSync(filePath, `${JSON.stringify(raw2, null, 2)}
`);
    writeAuditLog({
      entity: "dev-rule",
      action: "update",
      targetId: id,
      detail: { type, sourceFile, status: body.status }
    });
    return c.json({ id, type, sourceFile, status: body.status });
  } catch (error) {
    console.error("Failed to update dev rule status:", error);
    return c.json({ error: "Failed to update status" }, 500);
  }
});
devRules.delete("/:type/:sourceFile/:id", async (c) => {
  const type = c.req.param("type");
  const sourceFile = c.req.param("sourceFile");
  const id = sanitizeId(c.req.param("id"));
  if (!id || !sourceFile) {
    return c.json({ error: "Invalid parameters" }, 400);
  }
  try {
    let filePath;
    if (type === "decision") {
      const found = findJsonFileById(
        path4.join(getMnemeDir(), "decisions"),
        sourceFile
      );
      if (!found) return c.json({ error: "Source file not found" }, 404);
      filePath = found;
    } else if (type === "pattern") {
      filePath = path4.join(patternsDir(), `${sourceFile}.json`);
    } else {
      filePath = path4.join(rulesDir(), `${sourceFile}.json`);
    }
    if (!fs5.existsSync(filePath)) {
      return c.json({ error: "Source file not found" }, 404);
    }
    const raw2 = JSON.parse(fs5.readFileSync(filePath, "utf-8"));
    const arrayKey = raw2.items ? "items" : raw2.patterns ? "patterns" : null;
    if (arrayKey) {
      const before = raw2[arrayKey].length;
      raw2[arrayKey] = raw2[arrayKey].filter(
        (item) => String(item.id) !== id
      );
      if (raw2[arrayKey].length === before) {
        return c.json({ error: "Item not found" }, 404);
      }
      fs5.writeFileSync(filePath, `${JSON.stringify(raw2, null, 2)}
`);
    } else if (raw2.id && String(raw2.id) === id) {
      fs5.unlinkSync(filePath);
    } else {
      return c.json({ error: "Item not found" }, 404);
    }
    writeAuditLog({
      entity: "dev-rule",
      action: "delete",
      targetId: id,
      detail: { type, sourceFile }
    });
    return c.json({ deleted: 1, id });
  } catch (error) {
    console.error("Failed to delete dev rule:", error);
    return c.json({ error: "Failed to delete dev rule" }, 500);
  }
});
var dev_rules_default = devRules;

// dashboard/server/routes/analytics-graph.ts
var analyticsGraph = new Hono2();
analyticsGraph.get("/knowledge-graph", async (c) => {
  try {
    const mnemeDir2 = getMnemeDir();
    const sessionItems = readAllSessionIndexes(mnemeDir2).items;
    const devRules2 = collectDevRules().filter(
      (item) => item.status === "approved"
    );
    const sessionDataMap = /* @__PURE__ */ new Map();
    for (const item of sessionItems.filter((i) => i.hasSummary)) {
      try {
        const sessionPath = path5.join(mnemeDir2, item.filePath);
        const raw2 = fs6.readFileSync(sessionPath, "utf-8");
        const session = JSON.parse(raw2);
        if (session.resumedFrom) {
          sessionDataMap.set(item.id, {
            resumedFrom: session.resumedFrom
          });
        }
      } catch {
      }
    }
    const nodes = [
      ...sessionItems.filter((item) => item.hasSummary).map((item) => ({
        id: `session:${item.id}`,
        entityType: "session",
        entityId: item.id,
        title: item.title,
        tags: item.tags || [],
        createdAt: item.createdAt,
        branch: item.branch || null,
        resumedFrom: sessionDataMap.get(item.id)?.resumedFrom || null,
        unitSubtype: null,
        sourceId: null,
        appliedCount: null,
        acceptedCount: null
      })),
      ...devRules2.map((item) => ({
        id: `rule:${item.type}:${item.id}`,
        entityType: "rule",
        entityId: item.id,
        title: item.title,
        tags: item.tags || [],
        createdAt: item.createdAt,
        unitSubtype: item.type || null,
        sourceId: item.sourceFile || null,
        appliedCount: item.appliedCount ?? null,
        acceptedCount: item.acceptedCount ?? null,
        branch: null,
        resumedFrom: null,
        relatedSessions: item.relatedSessions || null,
        sourceRef: item.sourceRef || null,
        patternSourceId: item.sourceId || null
      }))
    ];
    const tagToNodes = /* @__PURE__ */ new Map();
    for (const node of nodes) {
      for (const tag of node.tags) {
        const list = tagToNodes.get(tag) || [];
        list.push(node.id);
        tagToNodes.set(tag, list);
      }
    }
    const edgeMap = /* @__PURE__ */ new Map();
    for (const [tag, nodeIds] of tagToNodes) {
      for (let i = 0; i < nodeIds.length; i++) {
        for (let j = i + 1; j < nodeIds.length; j++) {
          const key = nodeIds[i] < nodeIds[j] ? `${nodeIds[i]}|${nodeIds[j]}` : `${nodeIds[j]}|${nodeIds[i]}`;
          const existing = edgeMap.get(key);
          if (existing) {
            existing.weight++;
            existing.sharedTags.push(tag);
          } else {
            const [source, target] = key.split("|");
            edgeMap.set(key, {
              source,
              target,
              weight: 1,
              sharedTags: [tag],
              edgeType: "sharedTags",
              directed: false
            });
          }
        }
      }
    }
    const tagEdges = Array.from(edgeMap.values());
    const nodeIdSet = new Set(nodes.map((n) => n.id));
    const resumedEdges = [];
    for (const node of nodes) {
      if (node.entityType === "session" && node.resumedFrom) {
        const targetId = `session:${node.resumedFrom}`;
        if (nodeIdSet.has(targetId)) {
          resumedEdges.push({
            source: targetId,
            target: node.id,
            weight: 1,
            sharedTags: [],
            edgeType: "resumedFrom",
            directed: true
          });
        }
      }
    }
    const relationEdges = [];
    for (const node of nodes) {
      if (node.entityType === "rule" && node.relatedSessions) {
        const related = node.relatedSessions;
        for (const sessionId of related) {
          const targetId = `session:${sessionId}`;
          if (nodeIdSet.has(targetId)) {
            relationEdges.push({
              source: node.id,
              target: targetId,
              weight: 1,
              sharedTags: [],
              edgeType: "relatedSession",
              directed: true
            });
          }
        }
      }
      if (node.entityType === "rule" && node.sourceRef) {
        const ref = node.sourceRef;
        if (ref.type && ref.id) {
          const targetId = `rule:${ref.type}:${ref.id}`;
          if (nodeIdSet.has(targetId)) {
            relationEdges.push({
              source: node.id,
              target: targetId,
              weight: 1,
              sharedTags: [],
              edgeType: "sourceRef",
              directed: true
            });
          }
        }
      }
      if (node.entityType === "rule" && node.patternSourceId) {
        const sessionId = node.patternSourceId;
        const targetId = `session:${sessionId}`;
        if (nodeIdSet.has(targetId)) {
          relationEdges.push({
            source: node.id,
            target: targetId,
            weight: 1,
            sharedTags: [],
            edgeType: "sessionRef",
            directed: true
          });
        }
      }
    }
    const edges = [...tagEdges, ...resumedEdges, ...relationEdges];
    return c.json({ nodes, edges });
  } catch (error) {
    console.error("Failed to build knowledge graph:", error);
    return c.json({ error: "Failed to build knowledge graph" }, 500);
  }
});
var analytics_graph_default = analyticsGraph;

// dashboard/server/routes/analytics.ts
var analytics = new Hono2();
analytics.route("/", analytics_graph_default);
analytics.get("/timeline", async (c) => {
  const sessionsDir = path6.join(getMnemeDir(), "sessions");
  try {
    const files = listDatedJsonFiles(sessionsDir);
    if (files.length === 0) {
      return c.json({ timeline: {} });
    }
    const sessions2 = files.map((filePath) => {
      const content = fs7.readFileSync(filePath, "utf-8");
      return JSON.parse(content);
    });
    const grouped = {};
    for (const session of sessions2) {
      const date = session.createdAt?.split("T")[0] || "unknown";
      if (!grouped[date]) grouped[date] = [];
      grouped[date].push({
        id: session.id,
        title: session.title || "Untitled",
        sessionType: session.sessionType,
        branch: session.context?.branch,
        tags: session.tags || [],
        createdAt: session.createdAt
      });
    }
    const sortedTimeline = {};
    for (const date of Object.keys(grouped).sort().reverse()) {
      sortedTimeline[date] = grouped[date].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    }
    return c.json({ timeline: sortedTimeline });
  } catch (error) {
    console.error("Failed to build timeline:", error);
    return c.json({ error: "Failed to build timeline" }, 500);
  }
});
analytics.get("/tag-network", async (c) => {
  const sessionsDir = path6.join(getMnemeDir(), "sessions");
  try {
    const files = listDatedJsonFiles(sessionsDir);
    const tagCounts = /* @__PURE__ */ new Map();
    const coOccurrences = /* @__PURE__ */ new Map();
    for (const filePath of files) {
      const content = fs7.readFileSync(filePath, "utf-8");
      const session = JSON.parse(content);
      const tags = session.tags || [];
      for (const tag of tags) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      }
      for (let i = 0; i < tags.length; i++) {
        for (let j = i + 1; j < tags.length; j++) {
          const key = [tags[i], tags[j]].sort().join("|");
          coOccurrences.set(key, (coOccurrences.get(key) || 0) + 1);
        }
      }
    }
    const nodes = Array.from(tagCounts.entries()).map(([id, count]) => ({
      id,
      count
    }));
    const edges = Array.from(coOccurrences.entries()).map(([key, weight]) => {
      const [source, target] = key.split("|");
      return { source, target, weight };
    });
    return c.json({ nodes, edges });
  } catch (error) {
    console.error("Failed to build tag network:", error);
    return c.json({ error: "Failed to build tag network" }, 500);
  }
});
analytics.get("/stats/overview", async (c) => {
  const mnemeDir2 = getMnemeDir();
  try {
    const sessionsIndex = readAllSessionIndexes(mnemeDir2);
    const decisionsIndex = readAllDecisionIndexes(mnemeDir2);
    const validSessions = sessionsIndex.items.filter(
      (session) => session.interactionCount > 0 || session.hasSummary === true
    );
    const sessionTypeCount = {};
    for (const session of validSessions) {
      const type = session.sessionType || "unknown";
      sessionTypeCount[type] = (sessionTypeCount[type] || 0) + 1;
    }
    let totalPatterns = 0;
    const patternsByType = {};
    const patternsPath = path6.join(mnemeDir2, "patterns");
    if (fs7.existsSync(patternsPath)) {
      const patternFiles = listJsonFiles(patternsPath);
      for (const filePath of patternFiles) {
        try {
          const content = fs7.readFileSync(filePath, "utf-8");
          const data = JSON.parse(content);
          const patterns2 = data.items || data.patterns || [];
          for (const pattern of patterns2) {
            totalPatterns++;
            const type = pattern.type || "unknown";
            patternsByType[type] = (patternsByType[type] || 0) + 1;
          }
        } catch {
        }
      }
    }
    let totalRules = 0;
    const rulesByType = {};
    const rulesPath = path6.join(mnemeDir2, "rules");
    if (fs7.existsSync(rulesPath)) {
      for (const ruleType of ["dev-rules", "review-guidelines"]) {
        const rulePath = path6.join(rulesPath, `${ruleType}.json`);
        if (fs7.existsSync(rulePath)) {
          try {
            const content = fs7.readFileSync(rulePath, "utf-8");
            const data = JSON.parse(content);
            const items = data.items || [];
            rulesByType[ruleType] = items.length;
            totalRules += items.length;
          } catch {
          }
        }
      }
    }
    return c.json({
      sessions: {
        total: validSessions.length,
        byType: sessionTypeCount
      },
      decisions: {
        total: decisionsIndex.items.length
      },
      patterns: {
        total: totalPatterns,
        byType: patternsByType
      },
      rules: {
        total: totalRules,
        byType: rulesByType
      }
    });
  } catch (error) {
    console.error("Failed to get stats overview:", error);
    return c.json({ error: "Failed to get stats overview" }, 500);
  }
});
analytics.get("/stats/activity", async (c) => {
  const mnemeDir2 = getMnemeDir();
  const daysParam = Number.parseInt(c.req.query("days") || "30", 10);
  const MAX_DAYS = 365;
  const safeDays = Math.min(Math.max(1, daysParam), MAX_DAYS);
  try {
    const sessionsIndex = readAllSessionIndexes(mnemeDir2);
    const decisionsIndex = readAllDecisionIndexes(mnemeDir2);
    const now = /* @__PURE__ */ new Date();
    const startDate = new Date(
      now.getTime() - (safeDays - 1) * 24 * 60 * 60 * 1e3
    );
    const activityByDate = {};
    for (let i = 0; i < safeDays; i++) {
      const d = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1e3);
      const dateKey = d.toISOString().split("T")[0];
      activityByDate[dateKey] = { sessions: 0, decisions: 0 };
    }
    for (const session of sessionsIndex.items) {
      const dateKey = session.createdAt.split("T")[0];
      if (activityByDate[dateKey]) {
        activityByDate[dateKey].sessions += 1;
      }
    }
    for (const decision of decisionsIndex.items) {
      const dateKey = decision.createdAt.split("T")[0];
      if (activityByDate[dateKey]) {
        activityByDate[dateKey].decisions += 1;
      }
    }
    const activity = Object.entries(activityByDate).map(([date, counts]) => ({ date, ...counts })).sort((a, b) => a.date.localeCompare(b.date));
    return c.json({ activity, days: safeDays });
  } catch (error) {
    console.error("Failed to get activity stats:", error);
    return c.json({ error: "Failed to get activity stats" }, 500);
  }
});
analytics.get("/stats/tags", async (c) => {
  const mnemeDir2 = getMnemeDir();
  try {
    const sessionsIndex = readAllSessionIndexes(mnemeDir2);
    const tagCount = {};
    for (const session of sessionsIndex.items) {
      for (const tag of session.tags || []) {
        tagCount[tag] = (tagCount[tag] || 0) + 1;
      }
    }
    const tags = Object.entries(tagCount).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 20);
    return c.json({ tags });
  } catch (error) {
    console.error("Failed to get tag stats:", error);
    return c.json({ error: "Failed to get tag stats" }, 500);
  }
});
var analytics_default = analytics;

// dashboard/server/routes/decisions.ts
import fs8 from "node:fs";
import path7 from "node:path";

// dashboard/server/lib/pagination.ts
function parsePaginationParams(c) {
  return {
    page: Math.max(1, Number.parseInt(c.req.query("page") || "1", 10)),
    limit: Math.min(
      100,
      Math.max(1, Number.parseInt(c.req.query("limit") || "20", 10))
    ),
    tag: c.req.query("tag"),
    type: c.req.query("type"),
    project: c.req.query("project"),
    search: c.req.query("search"),
    showUntitled: c.req.query("showUntitled") === "true",
    allMonths: c.req.query("allMonths") === "true"
  };
}
function paginateArray(items, page, limit) {
  const total = items.length;
  const totalPages = Math.ceil(total / limit);
  const start = (page - 1) * limit;
  const data = items.slice(start, start + limit);
  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    }
  };
}

// dashboard/server/routes/decisions.ts
var decisions = new Hono2();
decisions.get("/", async (c) => {
  const useIndex = c.req.query("useIndex") !== "false";
  const usePagination = c.req.query("paginate") !== "false";
  const mnemeDir2 = getMnemeDir();
  const params = parsePaginationParams(c);
  try {
    let items;
    if (useIndex) {
      const index = params.allMonths ? readAllDecisionIndexes(mnemeDir2) : readRecentDecisionIndexes(mnemeDir2);
      items = index.items;
    } else {
      const decisionsDir = path7.join(mnemeDir2, "decisions");
      const files = listDatedJsonFiles(decisionsDir);
      if (files.length === 0) {
        return usePagination ? c.json({
          data: [],
          pagination: {
            page: 1,
            limit: params.limit,
            total: 0,
            totalPages: 0,
            hasNext: false,
            hasPrev: false
          }
        }) : c.json([]);
      }
      items = files.map((filePath) => {
        const content = fs8.readFileSync(filePath, "utf-8");
        return JSON.parse(content);
      });
      items.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    }
    let filtered = items;
    if (params.tag) {
      filtered = filtered.filter(
        (d) => d.tags?.includes(params.tag)
      );
    }
    if (params.search) {
      const query = params.search.toLowerCase();
      filtered = filtered.filter((d) => {
        const title = (d.title || "").toLowerCase();
        const decision = (d.decision || "").toLowerCase();
        return title.includes(query) || decision.includes(query);
      });
    }
    if (!usePagination) {
      return c.json(filtered);
    }
    return c.json(paginateArray(filtered, params.page, params.limit));
  } catch (error) {
    console.error("Failed to read decisions:", error);
    return c.json({ error: "Failed to read decisions" }, 500);
  }
});
decisions.get("/:id", async (c) => {
  const id = sanitizeId(c.req.param("id"));
  const decisionsDir = path7.join(getMnemeDir(), "decisions");
  try {
    const filePath = findJsonFileById(decisionsDir, id);
    if (!filePath) {
      return c.json({ error: "Decision not found" }, 404);
    }
    const decision = safeParseJsonFile(filePath);
    if (!decision) {
      return c.json({ error: "Failed to parse decision" }, 500);
    }
    return c.json(decision);
  } catch (error) {
    console.error("Failed to read decision:", error);
    return c.json({ error: "Failed to read decision" }, 500);
  }
});
decisions.get("/:id/impact", async (c) => {
  const decisionId = sanitizeId(c.req.param("id"));
  const sessionsDir = path7.join(getMnemeDir(), "sessions");
  const patternsPath = path7.join(getMnemeDir(), "patterns");
  try {
    const impactedSessions = [];
    const impactedPatterns = [];
    const sessionFiles = listDatedJsonFiles(sessionsDir);
    for (const filePath of sessionFiles) {
      const content = fs8.readFileSync(filePath, "utf-8");
      const session = JSON.parse(content);
      const hasReference = session.relatedSessions?.includes(decisionId) || session.interactions?.some(
        (i) => i.reasoning?.includes(decisionId) || i.choice?.includes(decisionId)
      );
      if (hasReference) {
        impactedSessions.push({
          id: session.id,
          title: session.title || "Untitled"
        });
      }
    }
    const patternFiles = listJsonFiles(patternsPath);
    for (const filePath of patternFiles) {
      const content = fs8.readFileSync(filePath, "utf-8");
      const data = JSON.parse(content);
      const patterns2 = data.patterns || [];
      for (const pattern of patterns2) {
        if (pattern.sourceId?.includes(decisionId) || pattern.description?.includes(decisionId)) {
          impactedPatterns.push({
            id: `${path7.basename(filePath, ".json")}-${pattern.type}`,
            description: pattern.description || "No description"
          });
        }
      }
    }
    return c.json({
      decisionId,
      impactedSessions,
      impactedPatterns
    });
  } catch (error) {
    console.error("Failed to analyze decision impact:", error);
    return c.json({ error: "Failed to analyze decision impact" }, 500);
  }
});
decisions.delete("/:id", async (c) => {
  const id = sanitizeId(c.req.param("id"));
  const decisionsDir = path7.join(getMnemeDir(), "decisions");
  try {
    const filePath = findJsonFileById(decisionsDir, id);
    if (!filePath) {
      return c.json({ error: "Decision not found" }, 404);
    }
    fs8.unlinkSync(filePath);
    rebuildAllDecisionIndexes(getMnemeDir());
    writeAuditLog({
      entity: "decision",
      action: "delete",
      targetId: id
    });
    return c.json({ deleted: 1, id });
  } catch (error) {
    console.error("Failed to delete decision:", error);
    return c.json({ error: "Failed to delete decision" }, 500);
  }
});
var decisions_default = decisions;

// dashboard/server/routes/export.ts
import fs9 from "node:fs";
import path8 from "node:path";
function sessionToMarkdown(session) {
  const lines = [];
  lines.push(`# ${session.title || "Untitled Session"}`);
  lines.push("");
  lines.push(`**ID:** ${session.id}`);
  lines.push(`**Created:** ${session.createdAt}`);
  if (session.sessionType) {
    lines.push(`**Type:** ${session.sessionType}`);
  }
  if (session.context) {
    const ctx = session.context;
    if (ctx.branch) lines.push(`**Branch:** ${ctx.branch}`);
    if (ctx.user) lines.push(`**User:** ${ctx.user}`);
  }
  lines.push("");
  if (session.goal) {
    lines.push("## Goal");
    lines.push("");
    lines.push(session.goal);
    lines.push("");
  }
  const tags = session.tags;
  if (tags && tags.length > 0) {
    lines.push("## Tags");
    lines.push("");
    lines.push(tags.map((t) => `\`${t}\``).join(", "));
    lines.push("");
  }
  const interactions = session.interactions;
  if (interactions && interactions.length > 0) {
    lines.push("## Interactions");
    lines.push("");
    for (const interaction of interactions) {
      lines.push(`### ${interaction.choice || "Interaction"}`);
      lines.push("");
      if (interaction.reasoning) {
        lines.push(`**Reasoning:** ${interaction.reasoning}`);
        lines.push("");
      }
      if (interaction.timestamp) {
        lines.push(`*${interaction.timestamp}*`);
        lines.push("");
      }
      lines.push("---");
      lines.push("");
    }
  }
  if (session.outcome) {
    lines.push("## Outcome");
    lines.push("");
    lines.push(session.outcome);
    lines.push("");
  }
  const relatedSessions = session.relatedSessions;
  if (relatedSessions && relatedSessions.length > 0) {
    lines.push("## Related Sessions");
    lines.push("");
    for (const relId of relatedSessions) {
      lines.push(`- ${relId}`);
    }
    lines.push("");
  }
  lines.push("---");
  lines.push("*Exported from mneme*");
  return lines.join("\n");
}
function decisionToMarkdown(decision) {
  const lines = [];
  lines.push(`# ${decision.title || "Untitled Decision"}`);
  lines.push("");
  lines.push(`**ID:** ${decision.id}`);
  lines.push(`**Status:** ${decision.status || "unknown"}`);
  lines.push(`**Created:** ${decision.createdAt}`);
  if (decision.updatedAt) {
    lines.push(`**Updated:** ${decision.updatedAt}`);
  }
  lines.push("");
  if (decision.decision) {
    lines.push("## Decision");
    lines.push("");
    lines.push(decision.decision);
    lines.push("");
  }
  if (decision.rationale) {
    lines.push("## Rationale");
    lines.push("");
    lines.push(decision.rationale);
    lines.push("");
  }
  const tags = decision.tags;
  if (tags && tags.length > 0) {
    lines.push("## Tags");
    lines.push("");
    lines.push(tags.map((t) => `\`${t}\``).join(", "));
    lines.push("");
  }
  const alternatives = decision.alternatives;
  if (alternatives && alternatives.length > 0) {
    lines.push("## Alternatives Considered");
    lines.push("");
    for (const alt of alternatives) {
      lines.push(`### ${alt.title || "Alternative"}`);
      if (alt.description) {
        lines.push("");
        lines.push(alt.description);
      }
      if (alt.pros) {
        lines.push("");
        lines.push("**Pros:**");
        for (const pro of alt.pros) {
          lines.push(`- ${pro}`);
        }
      }
      if (alt.cons) {
        lines.push("");
        lines.push("**Cons:**");
        for (const con of alt.cons) {
          lines.push(`- ${con}`);
        }
      }
      lines.push("");
    }
  }
  const relatedSessions = decision.relatedSessions;
  if (relatedSessions && relatedSessions.length > 0) {
    lines.push("## Related Sessions");
    lines.push("");
    for (const relId of relatedSessions) {
      lines.push(`- ${relId}`);
    }
    lines.push("");
  }
  lines.push("---");
  lines.push("*Exported from mneme*");
  return lines.join("\n");
}
var exportRoutes = new Hono2();
exportRoutes.get("/sessions/:id/markdown", async (c) => {
  const id = c.req.param("id");
  const sessionsDir = path8.join(getMnemeDir(), "sessions");
  try {
    const filePath = findJsonFileById(sessionsDir, id);
    if (!filePath) {
      return c.json({ error: "Session not found" }, 404);
    }
    const content = fs9.readFileSync(filePath, "utf-8");
    const session = JSON.parse(content);
    const markdown = sessionToMarkdown(session);
    const filename = `session-${id}.md`;
    c.header("Content-Type", "text/markdown; charset=utf-8");
    c.header("Content-Disposition", `attachment; filename="${filename}"`);
    return c.text(markdown);
  } catch (error) {
    console.error("Failed to export session:", error);
    return c.json({ error: "Failed to export session" }, 500);
  }
});
exportRoutes.get("/decisions/:id/markdown", async (c) => {
  const id = sanitizeId(c.req.param("id"));
  const decisionsDir = path8.join(getMnemeDir(), "decisions");
  try {
    const filePath = findJsonFileById(decisionsDir, id);
    if (!filePath) {
      return c.json({ error: "Decision not found" }, 404);
    }
    const content = fs9.readFileSync(filePath, "utf-8");
    const decision = JSON.parse(content);
    const markdown = decisionToMarkdown(decision);
    const filename = `decision-${id}.md`;
    c.header("Content-Type", "text/markdown; charset=utf-8");
    c.header("Content-Disposition", `attachment; filename="${filename}"`);
    return c.text(markdown);
  } catch (error) {
    console.error("Failed to export decision:", error);
    return c.json({ error: "Failed to export decision" }, 500);
  }
});
exportRoutes.post("/sessions/bulk", async (c) => {
  const body = await c.req.json();
  const { ids } = body;
  if (!ids || ids.length === 0) {
    return c.json({ error: "No session IDs provided" }, 400);
  }
  const sessionsDir = path8.join(getMnemeDir(), "sessions");
  const markdowns = [];
  try {
    for (const id of ids) {
      const filePath = findJsonFileById(sessionsDir, id);
      if (filePath) {
        const content = fs9.readFileSync(filePath, "utf-8");
        const session = JSON.parse(content);
        markdowns.push(sessionToMarkdown(session));
      }
    }
    if (markdowns.length === 0) {
      return c.json({ error: "No sessions found" }, 404);
    }
    const combined = markdowns.join("\n\n---\n\n");
    const filename = `sessions-export-${Date.now()}.md`;
    c.header("Content-Type", "text/markdown; charset=utf-8");
    c.header("Content-Disposition", `attachment; filename="${filename}"`);
    return c.text(combined);
  } catch (error) {
    console.error("Failed to export sessions:", error);
    return c.json({ error: "Failed to export sessions" }, 500);
  }
});
var export_default = exportRoutes;

// dashboard/server/routes/misc.ts
import fs10 from "node:fs";
import path9 from "node:path";

// dashboard/server/lib/ai-summary.ts
var getOpenAIKey = () => {
  return process.env.OPENAI_API_KEY || null;
};
function getTopTags(sessions2, limit) {
  const tagCount = {};
  for (const session of sessions2) {
    for (const tag of session.tags || []) {
      tagCount[tag] = (tagCount[tag] || 0) + 1;
    }
  }
  return Object.entries(tagCount).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, limit);
}
function getSessionTypeBreakdown(sessions2) {
  const breakdown = {};
  for (const session of sessions2) {
    const type = session.sessionType || "unknown";
    breakdown[type] = (breakdown[type] || 0) + 1;
  }
  return breakdown;
}
function buildSummaryPrompt(sessions2, decisions2) {
  const sessionList = sessions2.map((s) => `- ${s.title} (${s.sessionType || "unknown"})`).join("\n");
  const decisionList = decisions2.map((d) => `- ${d.title} (${d.status})`).join("\n");
  return `Provide a brief weekly development summary (2-3 sentences) based on this activity:

Sessions (${sessions2.length}):
${sessionList || "None"}

Decisions (${decisions2.length}):
${decisionList || "None"}

Focus on key accomplishments and patterns.`;
}
async function generateAISummary(apiKey, prompt) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 200,
      temperature: 0.7
    })
  });
  if (!response.ok) {
    throw new Error("OpenAI API request failed");
  }
  const data = await response.json();
  return data.choices?.[0]?.message?.content || "Unable to generate summary.";
}

// dashboard/server/routes/misc.ts
var misc = new Hono2();
misc.get("/project", (c) => {
  const projectRoot = getProjectRoot();
  const projectName = path9.basename(projectRoot);
  let repository = null;
  try {
    const gitConfigPath = path9.join(projectRoot, ".git", "config");
    if (fs10.existsSync(gitConfigPath)) {
      const gitConfig = fs10.readFileSync(gitConfigPath, "utf-8");
      const match2 = gitConfig.match(
        /url\s*=\s*.*[:/]([^/]+\/[^/]+?)(?:\.git)?$/m
      );
      if (match2) {
        repository = match2[1];
      }
    }
  } catch {
  }
  const version = "0.24.2";
  return c.json({
    name: projectName,
    path: projectRoot,
    repository,
    version
  });
});
misc.get("/info", async (c) => {
  const projectRoot = getProjectRoot();
  const mnemeDir2 = getMnemeDir();
  return c.json({
    projectRoot,
    mnemeDir: mnemeDir2,
    exists: fs10.existsSync(mnemeDir2)
  });
});
misc.get("/current-user", async (c) => {
  try {
    const user = getCurrentUser();
    return c.json({ user });
  } catch (error) {
    console.error("Failed to get current user:", error);
    return c.json({ error: "Failed to get current user" }, 500);
  }
});
misc.get("/tags", async (c) => {
  const tagsPath = path9.join(getMnemeDir(), "tags.json");
  try {
    if (!fs10.existsSync(tagsPath)) {
      return c.json({ version: 1, tags: [] });
    }
    const tags = safeParseJsonFile(tagsPath);
    if (!tags) {
      return c.json({ error: "Failed to parse tags" }, 500);
    }
    return c.json(tags);
  } catch (error) {
    console.error("Failed to read tags:", error);
    return c.json({ error: "Failed to read tags" }, 500);
  }
});
misc.get("/indexes/status", async (c) => {
  const mnemeDir2 = getMnemeDir();
  try {
    const sessionsIndex = readAllSessionIndexes(mnemeDir2);
    const decisionsIndex = readAllDecisionIndexes(mnemeDir2);
    return c.json({
      sessions: {
        exists: sessionsIndex.items.length > 0,
        itemCount: sessionsIndex.items.length,
        updatedAt: sessionsIndex.updatedAt,
        isStale: isIndexStale(sessionsIndex)
      },
      decisions: {
        exists: decisionsIndex.items.length > 0,
        itemCount: decisionsIndex.items.length,
        updatedAt: decisionsIndex.updatedAt,
        isStale: isIndexStale(decisionsIndex)
      }
    });
  } catch (error) {
    console.error("Failed to get index status:", error);
    return c.json({ error: "Failed to get index status" }, 500);
  }
});
misc.post("/indexes/rebuild", async (c) => {
  const mnemeDir2 = getMnemeDir();
  try {
    const sessionIndexes = rebuildAllSessionIndexes(mnemeDir2);
    const decisionIndexes = rebuildAllDecisionIndexes(mnemeDir2);
    let sessionCount = 0;
    let sessionUpdatedAt = "";
    for (const index of sessionIndexes.values()) {
      sessionCount += index.items.length;
      if (index.updatedAt > sessionUpdatedAt) {
        sessionUpdatedAt = index.updatedAt;
      }
    }
    let decisionCount = 0;
    let decisionUpdatedAt = "";
    for (const index of decisionIndexes.values()) {
      decisionCount += index.items.length;
      if (index.updatedAt > decisionUpdatedAt) {
        decisionUpdatedAt = index.updatedAt;
      }
    }
    return c.json({
      success: true,
      sessions: {
        itemCount: sessionCount,
        monthCount: sessionIndexes.size,
        updatedAt: sessionUpdatedAt || (/* @__PURE__ */ new Date()).toISOString()
      },
      decisions: {
        itemCount: decisionCount,
        monthCount: decisionIndexes.size,
        updatedAt: decisionUpdatedAt || (/* @__PURE__ */ new Date()).toISOString()
      }
    });
  } catch (error) {
    return c.json(
      { error: "Failed to rebuild indexes", details: String(error) },
      500
    );
  }
});
misc.get("/summary/weekly", async (c) => {
  const mnemeDir2 = getMnemeDir();
  const apiKey = getOpenAIKey();
  try {
    const sessionsIndex = readRecentSessionIndexes(mnemeDir2);
    const decisionsIndex = readRecentDecisionIndexes(mnemeDir2);
    const now = /* @__PURE__ */ new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1e3);
    const recentSessions = sessionsIndex.items.filter(
      (s) => new Date(s.createdAt) >= weekAgo
    );
    const recentDecisions = decisionsIndex.items.filter(
      (d) => new Date(d.createdAt) >= weekAgo
    );
    const summary = {
      period: { start: weekAgo.toISOString(), end: now.toISOString() },
      stats: {
        sessions: recentSessions.length,
        decisions: recentDecisions.length,
        interactions: recentSessions.reduce(
          (sum, s) => sum + (s.interactionCount || 0),
          0
        )
      },
      topTags: getTopTags(recentSessions, 5),
      sessionTypes: getSessionTypeBreakdown(recentSessions),
      aiSummary: null
    };
    if (apiKey && (recentSessions.length > 0 || recentDecisions.length > 0)) {
      try {
        const prompt = buildSummaryPrompt(recentSessions, recentDecisions);
        summary.aiSummary = await generateAISummary(apiKey, prompt);
      } catch (aiError) {
        console.error("AI summary generation failed:", aiError);
      }
    }
    return c.json(summary);
  } catch (error) {
    console.error("Failed to generate weekly summary:", error);
    return c.json({ error: "Failed to generate weekly summary" }, 500);
  }
});
misc.post("/summary/generate", async (c) => {
  const apiKey = getOpenAIKey();
  if (!apiKey) {
    return c.json(
      {
        error: "AI summary requires OPENAI_API_KEY environment variable (optional feature)"
      },
      400
    );
  }
  const body = await c.req.json();
  const { sessionIds, prompt: customPrompt } = body;
  const mnemeDir2 = getMnemeDir();
  const sessionsDir = path9.join(mnemeDir2, "sessions");
  try {
    const sessions2 = [];
    for (const id of sessionIds || []) {
      const filePath = findJsonFileById(sessionsDir, id);
      if (filePath) {
        const content = fs10.readFileSync(filePath, "utf-8");
        sessions2.push(JSON.parse(content));
      }
    }
    if (sessions2.length === 0) {
      return c.json({ error: "No sessions found" }, 404);
    }
    const prompt = customPrompt || `Summarize the following development sessions concisely:

${sessions2.map((s) => `- ${s.title}: ${s.goal || "No goal specified"}`).join("\n")}`;
    const summary = await generateAISummary(apiKey, prompt);
    return c.json({ summary });
  } catch (error) {
    console.error("Failed to generate summary:", error);
    return c.json({ error: "Failed to generate summary" }, 500);
  }
});
var misc_default = misc;

// dashboard/server/routes/patterns.ts
import fs11 from "node:fs";
import path10 from "node:path";
var patterns = new Hono2();
patterns.get("/", async (c) => {
  const dir = patternsDir();
  try {
    if (!fs11.existsSync(dir)) {
      return c.json({ patterns: [] });
    }
    const files = listJsonFiles(dir);
    const allPatterns = [];
    for (const filePath of files) {
      try {
        const content = fs11.readFileSync(filePath, "utf-8");
        const data = JSON.parse(content);
        const items = data.items || data.patterns || [];
        for (const pattern of items) {
          allPatterns.push({
            ...pattern,
            sourceFile: path10.basename(filePath, ".json")
          });
        }
      } catch {
      }
    }
    allPatterns.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    return c.json({ patterns: allPatterns });
  } catch (error) {
    console.error("Failed to read patterns:", error);
    return c.json({ error: "Failed to read patterns" }, 500);
  }
});
patterns.get("/stats", async (c) => {
  const dir = patternsDir();
  try {
    if (!fs11.existsSync(dir)) {
      return c.json({ total: 0, byType: {}, bySource: {} });
    }
    const files = listJsonFiles(dir);
    let total = 0;
    const byType = {};
    const bySource = {};
    for (const filePath of files) {
      try {
        const content = fs11.readFileSync(filePath, "utf-8");
        const data = JSON.parse(content);
        const items = data.items || data.patterns || [];
        const sourceName = path10.basename(filePath, ".json");
        for (const pattern of items) {
          total++;
          const type = pattern.type || "unknown";
          byType[type] = (byType[type] || 0) + 1;
          bySource[sourceName] = (bySource[sourceName] || 0) + 1;
        }
      } catch {
      }
    }
    return c.json({ total, byType, bySource });
  } catch (error) {
    console.error("Failed to get pattern stats:", error);
    return c.json({ error: "Failed to get pattern stats" }, 500);
  }
});
patterns.delete("/:id", async (c) => {
  const id = sanitizeId(c.req.param("id"));
  const sourceFile = c.req.query("source");
  if (!id) {
    return c.json({ error: "Invalid pattern id" }, 400);
  }
  if (!sourceFile) {
    return c.json({ error: "Missing source file" }, 400);
  }
  const safeSource = sourceFile.replace(/[^a-zA-Z0-9_-]/g, "");
  const filePath = path10.join(patternsDir(), `${safeSource}.json`);
  if (!fs11.existsSync(filePath)) {
    return c.json({ error: "Pattern source file not found" }, 404);
  }
  try {
    const content = fs11.readFileSync(filePath, "utf-8");
    const data = JSON.parse(content);
    let deleted = 0;
    if (Array.isArray(data.items)) {
      const nextItems = data.items.filter((item) => item.id !== id);
      deleted = data.items.length - nextItems.length;
      data.items = nextItems;
    } else if (Array.isArray(data.patterns)) {
      const nextPatterns = data.patterns.filter((item) => item.id !== id);
      deleted = data.patterns.length - nextPatterns.length;
      data.patterns = nextPatterns;
    } else {
      return c.json({ error: "Invalid pattern file format" }, 500);
    }
    if (deleted === 0) {
      return c.json({ error: "Pattern not found" }, 404);
    }
    fs11.writeFileSync(filePath, JSON.stringify(data, null, 2));
    writeAuditLog({
      entity: "pattern",
      action: "delete",
      targetId: id,
      detail: { sourceFile: safeSource }
    });
    return c.json({ deleted, id, sourceFile: safeSource });
  } catch (error) {
    console.error("Failed to delete pattern:", error);
    return c.json({ error: "Failed to delete pattern" }, 500);
  }
});
var patterns_default = patterns;

// dashboard/server/routes/rules.ts
import fs12 from "node:fs";
import path11 from "node:path";
var rules = new Hono2();
rules.get("/:id", async (c) => {
  const id = c.req.param("id");
  if (!ALLOWED_RULE_FILES.has(id)) {
    return c.json({ error: "Invalid rule type" }, 400);
  }
  const dir = rulesDir();
  try {
    const filePath = path11.join(dir, `${id}.json`);
    if (!fs12.existsSync(filePath)) {
      return c.json({ error: "Rules not found" }, 404);
    }
    const rulesData = safeParseJsonFile(filePath);
    if (!rulesData) {
      return c.json({ error: "Failed to parse rules" }, 500);
    }
    return c.json(rulesData);
  } catch (error) {
    console.error("Failed to read rules:", error);
    return c.json({ error: "Failed to read rules" }, 500);
  }
});
rules.put("/:id", async (c) => {
  const id = c.req.param("id");
  if (!ALLOWED_RULE_FILES.has(id)) {
    return c.json({ error: "Invalid rule type" }, 400);
  }
  const dir = rulesDir();
  try {
    const filePath = path11.join(dir, `${id}.json`);
    if (!fs12.existsSync(filePath)) {
      return c.json({ error: "Rules not found" }, 404);
    }
    const body = await c.req.json();
    if (!body.items || !Array.isArray(body.items)) {
      return c.json({ error: "Invalid rules format" }, 400);
    }
    fs12.writeFileSync(filePath, JSON.stringify(body, null, 2));
    writeAuditLog({
      entity: "rule",
      action: "update",
      targetId: id,
      detail: { itemCount: body.items.length }
    });
    return c.json(body);
  } catch (error) {
    console.error("Failed to update rules:", error);
    return c.json({ error: "Failed to update rules" }, 500);
  }
});
rules.delete("/:id/:ruleId", async (c) => {
  const id = c.req.param("id");
  if (!ALLOWED_RULE_FILES.has(id)) {
    return c.json({ error: "Invalid rule type" }, 400);
  }
  const ruleId = sanitizeId(c.req.param("ruleId"));
  if (!ruleId) {
    return c.json({ error: "Invalid rule id" }, 400);
  }
  const filePath = path11.join(rulesDir(), `${id}.json`);
  if (!fs12.existsSync(filePath)) {
    return c.json({ error: "Rules not found" }, 404);
  }
  try {
    const doc = safeParseJsonFile(filePath);
    if (!doc || !Array.isArray(doc.items)) {
      return c.json({ error: "Invalid rules format" }, 500);
    }
    const nextItems = doc.items.filter((item) => item.id !== ruleId);
    if (nextItems.length === doc.items.length) {
      return c.json({ error: "Rule not found" }, 404);
    }
    const nextDoc = {
      ...doc,
      items: nextItems,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    fs12.writeFileSync(filePath, JSON.stringify(nextDoc, null, 2));
    writeAuditLog({
      entity: "rule",
      action: "delete",
      targetId: ruleId,
      detail: { ruleType: id }
    });
    return c.json({ deleted: 1, id: ruleId, ruleType: id });
  } catch (error) {
    console.error("Failed to delete rule:", error);
    return c.json({ error: "Failed to delete rule" }, 500);
  }
});
var rules_default = rules;

// dashboard/server/routes/sessions.ts
import fs15 from "node:fs";
import path14 from "node:path";

// dashboard/server/routes/sessions-delete.ts
import fs13 from "node:fs";
import path12 from "node:path";
var sessionsDelete = new Hono2();
sessionsDelete.delete("/:id", async (c) => {
  const id = toShortId(sanitizeId(c.req.param("id")));
  const dryRun = c.req.query("dry-run") === "true";
  const mnemeDir2 = getMnemeDir();
  const sessionsDir = path12.join(mnemeDir2, "sessions");
  try {
    const filePath = findJsonFileById(sessionsDir, id);
    if (!filePath) {
      return c.json({ error: "Session not found" }, 404);
    }
    const sessionData = safeParseJsonFile(filePath);
    const db = openLocalDatabase(getProjectRoot());
    let interactionCount = 0;
    if (db) {
      interactionCount = countInteractions(db, { sessionId: id });
      if (!dryRun) {
        deleteInteractions(db, id);
        deleteBackups(db, id);
      }
      db.close();
    }
    if (!dryRun) {
      fs13.unlinkSync(filePath);
      const mdPath = filePath.replace(/\.json$/, ".md");
      if (fs13.existsSync(mdPath)) {
        fs13.unlinkSync(mdPath);
      }
      const sessionLinksDir = path12.join(mnemeDir2, "session-links");
      const linkPath = path12.join(sessionLinksDir, `${id}.json`);
      if (fs13.existsSync(linkPath)) {
        fs13.unlinkSync(linkPath);
      }
      if (sessionData?.createdAt) {
        const date = new Date(sessionData.createdAt);
        const year = date.getFullYear().toString();
        const month = (date.getMonth() + 1).toString().padStart(2, "0");
        rebuildSessionIndexForMonth(mnemeDir2, year, month);
      }
      writeAuditLog({
        entity: "session",
        action: "delete",
        targetId: id
      });
    }
    return c.json({
      deleted: dryRun ? 0 : 1,
      interactionsDeleted: dryRun ? 0 : interactionCount,
      dryRun,
      sessionId: id
    });
  } catch (error) {
    console.error("Failed to delete session:", error);
    return c.json({ error: "Failed to delete session" }, 500);
  }
});
sessionsDelete.delete("/", async (c) => {
  const dryRun = c.req.query("dry-run") === "true";
  const projectFilter = c.req.query("project");
  const repositoryFilter = c.req.query("repository");
  const beforeFilter = c.req.query("before");
  const mnemeDir2 = getMnemeDir();
  const sessionsDir = path12.join(mnemeDir2, "sessions");
  try {
    const files = listDatedJsonFiles(sessionsDir);
    const sessionsToDelete = [];
    for (const filePath of files) {
      try {
        const content = fs13.readFileSync(filePath, "utf-8");
        const session = JSON.parse(content);
        let shouldDelete = true;
        if (projectFilter) {
          const sessionProject = session.context?.projectDir;
          if (sessionProject !== projectFilter) {
            shouldDelete = false;
          }
        }
        if (repositoryFilter && shouldDelete) {
          const sessionRepo = session.context?.repository;
          if (sessionRepo !== repositoryFilter) {
            shouldDelete = false;
          }
        }
        if (beforeFilter && shouldDelete) {
          const sessionDate = session.createdAt?.split("T")[0];
          if (!sessionDate || sessionDate >= beforeFilter) {
            shouldDelete = false;
          }
        }
        if (shouldDelete) {
          sessionsToDelete.push({ id: session.id, path: filePath });
        }
      } catch {
      }
    }
    let totalInteractions = 0;
    const db = openLocalDatabase(getProjectRoot());
    if (db) {
      for (const session of sessionsToDelete) {
        totalInteractions += countInteractions(db, { sessionId: session.id });
      }
      if (!dryRun) {
        for (const session of sessionsToDelete) {
          deleteInteractions(db, session.id);
          deleteBackups(db, session.id);
        }
      }
      db.close();
    }
    if (!dryRun) {
      for (const session of sessionsToDelete) {
        fs13.unlinkSync(session.path);
        const mdPath = session.path.replace(/\.json$/, ".md");
        if (fs13.existsSync(mdPath)) {
          fs13.unlinkSync(mdPath);
        }
        const sessionLinksDir = path12.join(mnemeDir2, "session-links");
        const linkPath = path12.join(sessionLinksDir, `${session.id}.json`);
        if (fs13.existsSync(linkPath)) {
          fs13.unlinkSync(linkPath);
        }
        writeAuditLog({
          entity: "session",
          action: "delete",
          targetId: session.id
        });
      }
    }
    return c.json({
      deleted: dryRun ? 0 : sessionsToDelete.length,
      interactionsDeleted: dryRun ? 0 : totalInteractions,
      wouldDelete: sessionsToDelete.length,
      dryRun,
      filters: {
        project: projectFilter || null,
        repository: repositoryFilter || null,
        before: beforeFilter || null
      }
    });
  } catch (error) {
    console.error("Failed to delete sessions:", error);
    return c.json({ error: "Failed to delete sessions" }, 500);
  }
});
var sessions_delete_default = sessionsDelete;

// dashboard/server/routes/sessions-interactions.ts
import fs14 from "node:fs";
import path13 from "node:path";
var sessionsInteractions = new Hono2();
sessionsInteractions.get("/:id/interactions", async (c) => {
  const rawId = sanitizeId(c.req.param("id"));
  const shortId = toShortId(rawId);
  const mnemeDir2 = getMnemeDir();
  const sessionLinksDir = path13.join(mnemeDir2, "session-links");
  const sessionsDir = path13.join(mnemeDir2, "sessions");
  try {
    const sessionFilePath = findJsonFileById(sessionsDir, shortId);
    let projectDir = getProjectRoot();
    let primaryClaudeSessionId = null;
    if (rawId.length === 36 && rawId[8] === "-") {
      primaryClaudeSessionId = rawId;
    }
    if (sessionFilePath) {
      const sessionData = safeParseJsonFile(sessionFilePath);
      if (sessionData?.context?.projectDir) {
        projectDir = sessionData.context.projectDir;
      }
      if (sessionData?.sessionId && !primaryClaudeSessionId) {
        primaryClaudeSessionId = sessionData.sessionId;
      }
    }
    const db = openLocalDatabase(projectDir);
    if (!db) {
      return c.json({ interactions: [], count: 0 });
    }
    const { sessionIds, claudeSessionIds } = collectLinkedSessionIds({
      shortId,
      primaryClaudeSessionId,
      sessionLinksDir,
      sessionsDir
    });
    const interactions = claudeSessionIds.length > 0 ? getInteractionsByClaudeSessionIds(db, claudeSessionIds) : getInteractionsBySessionIds(db, sessionIds);
    db.close();
    const groupedInteractions = buildGroupedInteractions(interactions);
    return c.json({
      interactions: groupedInteractions,
      count: groupedInteractions.length
    });
  } catch (error) {
    console.error("Failed to get session interactions:", error);
    return c.json({ error: "Failed to get session interactions" }, 500);
  }
});
function collectLinkedSessionIds(params) {
  const { shortId, primaryClaudeSessionId, sessionLinksDir, sessionsDir } = params;
  let masterId = shortId;
  const myLinkFile = path13.join(sessionLinksDir, `${shortId}.json`);
  if (fs14.existsSync(myLinkFile)) {
    try {
      const myLinkData = JSON.parse(fs14.readFileSync(myLinkFile, "utf-8"));
      if (myLinkData.masterSessionId) {
        masterId = myLinkData.masterSessionId;
      }
    } catch {
    }
  }
  const sessionIds = [masterId];
  const claudeSessionIds = [];
  if (primaryClaudeSessionId) {
    claudeSessionIds.push(primaryClaudeSessionId);
  }
  if (masterId !== shortId) {
    sessionIds.push(shortId);
  }
  if (fs14.existsSync(sessionLinksDir)) {
    const linkFiles = fs14.readdirSync(sessionLinksDir);
    for (const linkFile of linkFiles) {
      if (!linkFile.endsWith(".json")) continue;
      const linkPath = path13.join(sessionLinksDir, linkFile);
      try {
        const linkData = JSON.parse(fs14.readFileSync(linkPath, "utf-8"));
        if (linkData.masterSessionId === masterId) {
          const childId = linkFile.replace(".json", "");
          if (!sessionIds.includes(childId)) {
            sessionIds.push(childId);
          }
          const childSessionFile = findJsonFileById(sessionsDir, childId);
          if (childSessionFile) {
            const childData = safeParseJsonFile(
              childSessionFile
            );
            if (childData?.sessionId) {
              claudeSessionIds.push(childData.sessionId);
            }
          }
        }
      } catch {
      }
    }
  }
  const sessionFiles = listDatedJsonFiles(sessionsDir);
  for (const sessionFile of sessionFiles) {
    try {
      const sessionData = JSON.parse(fs14.readFileSync(sessionFile, "utf-8"));
      if (sessionData.resumedFrom === masterId && sessionData.id !== masterId) {
        if (!sessionIds.includes(sessionData.id)) {
          sessionIds.push(sessionData.id);
        }
        if (sessionData.sessionId) {
          claudeSessionIds.push(sessionData.sessionId);
        }
      }
    } catch {
    }
  }
  return { sessionIds, claudeSessionIds };
}
function buildGroupedInteractions(interactions) {
  const grouped = [];
  let current = null;
  for (const interaction of interactions) {
    if (interaction.role === "user") {
      if (current) {
        grouped.push(current);
      }
      const meta = parseInteractionMetadata(interaction.tool_calls);
      current = {
        id: `int-${String(grouped.length + 1).padStart(3, "0")}`,
        timestamp: interaction.timestamp,
        user: interaction.content,
        assistant: "",
        thinking: null,
        isCompactSummary: !!interaction.is_compact_summary,
        ...meta,
        ...interaction.agent_id && { agentId: interaction.agent_id },
        ...interaction.agent_type && { agentType: interaction.agent_type }
      };
    } else if (interaction.role === "assistant" && current) {
      current.assistant = interaction.content;
      current.thinking = interaction.thinking || null;
    }
  }
  if (current) {
    grouped.push(current);
  }
  return grouped;
}
function parseInteractionMetadata(toolCalls) {
  if (!toolCalls) return {};
  try {
    const metadata = JSON.parse(toolCalls);
    const result = {};
    if (metadata.hasPlanMode) {
      result.hasPlanMode = true;
      if (metadata.planTools?.length > 0) result.planTools = metadata.planTools;
    }
    if (metadata.inPlanMode) result.inPlanMode = true;
    if (metadata.toolsUsed?.length > 0) result.toolsUsed = metadata.toolsUsed;
    if (metadata.toolDetails?.length > 0)
      result.toolDetails = metadata.toolDetails;
    if (metadata.slashCommand) result.slashCommand = metadata.slashCommand;
    if (metadata.toolResults?.length > 0)
      result.toolResults = metadata.toolResults;
    if (metadata.progressEvents?.length > 0)
      result.progressEvents = metadata.progressEvents;
    return result;
  } catch {
    return {};
  }
}
var sessions_interactions_default = sessionsInteractions;

// dashboard/server/routes/sessions.ts
var sessions = new Hono2();
sessions.route("/", sessions_delete_default);
sessions.route("/", sessions_interactions_default);
sessions.get("/", async (c) => {
  const useIndex = c.req.query("useIndex") !== "false";
  const usePagination = c.req.query("paginate") !== "false";
  const mnemeDir2 = getMnemeDir();
  const params = parsePaginationParams(c);
  try {
    let items;
    if (useIndex) {
      const index = params.allMonths ? readAllSessionIndexes(mnemeDir2) : readRecentSessionIndexes(mnemeDir2);
      items = index.items;
    } else {
      const sessionsDir = path14.join(mnemeDir2, "sessions");
      const files = listDatedJsonFiles(sessionsDir);
      if (files.length === 0) {
        return usePagination ? c.json({
          data: [],
          pagination: {
            page: 1,
            limit: params.limit,
            total: 0,
            totalPages: 0,
            hasNext: false,
            hasPrev: false
          }
        }) : c.json([]);
      }
      items = files.map((filePath) => {
        const content = fs15.readFileSync(filePath, "utf-8");
        return JSON.parse(content);
      });
      items.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    }
    let filtered = items;
    if (!params.showUntitled) {
      filtered = filtered.filter((s) => s.hasSummary === true);
    }
    if (params.tag) {
      filtered = filtered.filter(
        (s) => s.tags?.includes(params.tag)
      );
    }
    if (params.type) {
      filtered = filtered.filter((s) => s.sessionType === params.type);
    }
    if (params.project) {
      const projectQuery = params.project;
      filtered = filtered.filter((s) => {
        const ctx = s.context;
        const projectName = ctx?.projectName;
        const repository = ctx?.repository;
        return projectName === projectQuery || repository === projectQuery || repository?.endsWith(`/${projectQuery}`);
      });
    }
    if (params.search) {
      const query = params.search.toLowerCase();
      filtered = filtered.filter((s) => {
        const title = (s.title || "").toLowerCase();
        const goal = (s.goal || "").toLowerCase();
        return title.includes(query) || goal.includes(query);
      });
    }
    if (!usePagination) {
      return c.json(filtered);
    }
    return c.json(paginateArray(filtered, params.page, params.limit));
  } catch (error) {
    console.error("Failed to read sessions:", error);
    return c.json({ error: "Failed to read sessions" }, 500);
  }
});
sessions.get("/graph", async (c) => {
  const mnemeDir2 = getMnemeDir();
  const showUntitled = c.req.query("showUntitled") === "true";
  try {
    const sessionsIndex = readAllSessionIndexes(mnemeDir2);
    const filteredItems = showUntitled ? sessionsIndex.items : sessionsIndex.items.filter((s) => s.hasSummary === true);
    const nodes = filteredItems.map((session) => ({
      id: session.id,
      title: session.title,
      type: session.sessionType || "unknown",
      tags: session.tags || [],
      createdAt: session.createdAt
    }));
    const tagToNodes = /* @__PURE__ */ new Map();
    for (const item of filteredItems) {
      for (const tag of item.tags || []) {
        const list = tagToNodes.get(tag) || [];
        list.push(item.id);
        tagToNodes.set(tag, list);
      }
    }
    const edgeMap = /* @__PURE__ */ new Map();
    for (const [, nodeIds] of tagToNodes) {
      for (let i = 0; i < nodeIds.length; i++) {
        for (let j = i + 1; j < nodeIds.length; j++) {
          const key = nodeIds[i] < nodeIds[j] ? `${nodeIds[i]}|${nodeIds[j]}` : `${nodeIds[j]}|${nodeIds[i]}`;
          const existing = edgeMap.get(key);
          if (existing) {
            existing.weight++;
          } else {
            const [source, target] = key.split("|");
            edgeMap.set(key, { source, target, weight: 1 });
          }
        }
      }
    }
    const edges = Array.from(edgeMap.values());
    return c.json({ nodes, edges });
  } catch (error) {
    console.error("Failed to build session graph:", error);
    return c.json({ error: "Failed to build session graph" }, 500);
  }
});
sessions.get("/:id", async (c) => {
  const id = sanitizeId(c.req.param("id"));
  const sessionsDir = path14.join(getMnemeDir(), "sessions");
  try {
    const filePath = findJsonFileById(sessionsDir, id);
    if (!filePath) {
      return c.json({ error: "Session not found" }, 404);
    }
    const session = safeParseJsonFile(filePath);
    if (!session) {
      return c.json({ error: "Failed to parse session" }, 500);
    }
    return c.json(session);
  } catch (error) {
    console.error("Failed to read session:", error);
    return c.json({ error: "Failed to read session" }, 500);
  }
});
sessions.get("/:id/markdown", async (c) => {
  const id = sanitizeId(c.req.param("id"));
  const sessionsDir = path14.join(getMnemeDir(), "sessions");
  try {
    const jsonPath = findJsonFileById(sessionsDir, id);
    if (!jsonPath) {
      return c.json({ error: "Session not found" }, 404);
    }
    const mdPath = jsonPath.replace(/\.json$/, ".md");
    if (!fs15.existsSync(mdPath)) {
      return c.json({ exists: false, content: null });
    }
    const content = fs15.readFileSync(mdPath, "utf-8");
    return c.json({ exists: true, content });
  } catch (error) {
    console.error("Failed to read session markdown:", error);
    return c.json({ error: "Failed to read session markdown" }, 500);
  }
});
var sessions_default = sessions;

// dashboard/server/routes/team.ts
import fs16 from "node:fs";
import path15 from "node:path";
var team = new Hono2();
function collectTeamData(mnemeDir2) {
  const sessionsIndex = readAllSessionIndexes(mnemeDir2);
  const decisionsIndex = readAllDecisionIndexes(mnemeDir2);
  const memberMap = /* @__PURE__ */ new Map();
  function ensureMember(name) {
    if (!memberMap.has(name)) {
      memberMap.set(name, {
        sessions: 0,
        decisions: 0,
        patterns: 0,
        rules: 0,
        lastActive: ""
      });
    }
    return memberMap.get(name);
  }
  function updateLastActive(member, date) {
    if (date && date > member.lastActive) {
      member.lastActive = date;
    }
  }
  for (const item of sessionsIndex.items) {
    if (!item.user) continue;
    const member = ensureMember(item.user);
    member.sessions++;
    updateLastActive(member, item.createdAt);
  }
  for (const item of decisionsIndex.items) {
    if (!item.user) continue;
    const member = ensureMember(item.user);
    member.decisions++;
    updateLastActive(member, item.createdAt);
  }
  const patDir = patternsDir();
  let totalPatterns = 0;
  if (fs16.existsSync(patDir)) {
    const patternFiles = listJsonFiles(patDir);
    for (const filePath of patternFiles) {
      const doc = safeParseJsonFile(filePath);
      const entries = doc?.items || doc?.patterns || [];
      totalPatterns += entries.length;
    }
  }
  if (totalPatterns > 0 && memberMap.size > 0) {
    let primaryMember = memberMap.values().next().value;
    for (const stats of memberMap.values()) {
      if (stats.sessions > (primaryMember?.sessions ?? 0)) {
        primaryMember = stats;
      }
    }
    if (primaryMember) {
      primaryMember.patterns = totalPatterns;
    }
  }
  return { memberMap, sessionsIndex, decisionsIndex };
}
team.get("/overview", async (c) => {
  try {
    const mnemeDir2 = getMnemeDir();
    const { memberMap } = collectTeamData(mnemeDir2);
    const members = Array.from(memberMap.entries()).map(([name, stats]) => ({ name, ...stats })).sort((a, b) => b.sessions - a.sessions);
    return c.json({ members });
  } catch (error) {
    console.error("Failed to get team overview:", error);
    return c.json({ error: "Failed to get team overview" }, 500);
  }
});
team.get("/activity", async (c) => {
  try {
    const mnemeDir2 = getMnemeDir();
    const daysParam = Number.parseInt(c.req.query("days") || "30", 10);
    const safeDays = Math.min(Math.max(1, daysParam), 365);
    const { sessionsIndex, decisionsIndex } = collectTeamData(mnemeDir2);
    const now = /* @__PURE__ */ new Date();
    const startDate = new Date(
      now.getTime() - (safeDays - 1) * 24 * 60 * 60 * 1e3
    );
    const activityByDate = {};
    for (let i = 0; i < safeDays; i++) {
      const d = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1e3);
      const dateKey = d.toISOString().split("T")[0];
      activityByDate[dateKey] = {};
    }
    for (const session of sessionsIndex.items) {
      if (!session.user) continue;
      const dateKey = session.createdAt.split("T")[0];
      if (activityByDate[dateKey]) {
        if (!activityByDate[dateKey][session.user]) {
          activityByDate[dateKey][session.user] = {
            sessions: 0,
            decisions: 0
          };
        }
        activityByDate[dateKey][session.user].sessions++;
      }
    }
    for (const decision of decisionsIndex.items) {
      if (!decision.user) continue;
      const dateKey = decision.createdAt.split("T")[0];
      if (activityByDate[dateKey]) {
        if (!activityByDate[dateKey][decision.user]) {
          activityByDate[dateKey][decision.user] = {
            sessions: 0,
            decisions: 0
          };
        }
        activityByDate[dateKey][decision.user].decisions++;
      }
    }
    const activity = Object.entries(activityByDate).map(([date, members]) => ({ date, members })).sort((a, b) => a.date.localeCompare(b.date));
    return c.json({ activity, days: safeDays });
  } catch (error) {
    console.error("Failed to get team activity:", error);
    return c.json({ error: "Failed to get team activity" }, 500);
  }
});
team.get("/quality", async (c) => {
  try {
    const rDir = rulesDir();
    let totalRules = 0;
    let approvedRules = 0;
    const topRules = [];
    if (fs16.existsSync(rDir)) {
      for (const ruleFile of ["dev-rules", "review-guidelines"]) {
        const filePath = path15.join(rDir, `${ruleFile}.json`);
        const doc = safeParseJsonFile(filePath);
        if (!doc?.items) continue;
        for (const item of doc.items) {
          totalRules++;
          if (item.status === "approved") approvedRules++;
          const applied = typeof item.appliedCount === "number" ? item.appliedCount : 0;
          const accepted = typeof item.acceptedCount === "number" ? item.acceptedCount : 0;
          if (applied > 0) {
            topRules.push({
              id: String(item.id || ""),
              text: String(item.text || item.title || item.rule || ""),
              appliedCount: applied,
              acceptedCount: accepted
            });
          }
        }
      }
    }
    topRules.sort((a, b) => {
      const rateA = a.appliedCount > 0 ? a.acceptedCount / a.appliedCount : 0;
      const rateB = b.appliedCount > 0 ? b.acceptedCount / b.appliedCount : 0;
      return rateB - rateA;
    });
    const withApplied = topRules.filter((r) => r.appliedCount > 0);
    const least = [...withApplied].sort((a, b) => {
      const rateA = a.acceptedCount / a.appliedCount;
      const rateB = b.acceptedCount / b.appliedCount;
      return rateA - rateB;
    }).slice(0, 5);
    return c.json({
      approvalRate: totalRules > 0 ? Math.round(approvedRules / totalRules * 100) : 0,
      totalRules,
      approvedRules,
      topRules: topRules.slice(0, 5),
      leastEffective: least
    });
  } catch (error) {
    console.error("Failed to get team quality:", error);
    return c.json({ error: "Failed to get team quality" }, 500);
  }
});
var team_default = team;

// dashboard/server/index.ts
var app = new Hono2();
app.use(
  "/api/*",
  cors({
    origin: (origin) => {
      if (!origin) return void 0;
      if (origin.startsWith("http://localhost:")) return origin;
      return null;
    }
  })
);
app.route("/api/sessions", sessions_default);
app.route("/api/decisions", decisions_default);
app.route("/api/rules", rules_default);
app.route("/api/patterns", patterns_default);
app.route("/api/dev-rules", dev_rules_default);
app.route("/api/export", export_default);
app.route("/api/team", team_default);
app.route("/api", analytics_default);
app.route("/api", misc_default);
var distPath = path16.join(import.meta.dirname, "public");
if (fs17.existsSync(distPath)) {
  app.use("/*", serveStatic({ root: distPath }));
  app.get("*", async (c) => {
    const indexPath = path16.join(distPath, "index.html");
    if (fs17.existsSync(indexPath)) {
      const content = fs17.readFileSync(indexPath, "utf-8");
      return c.html(content);
    }
    return c.notFound();
  });
}
var requestedPort = parseInt(process.env.PORT || "7777", 10);
var maxPortAttempts = 10;
var mnemeDir = getMnemeDir();
if (fs17.existsSync(mnemeDir)) {
  try {
    const sessionsIndex = readRecentSessionIndexes(mnemeDir, 1);
    const decisionsIndex = readRecentDecisionIndexes(mnemeDir, 1);
    if (isIndexStale(sessionsIndex) || isIndexStale(decisionsIndex)) {
      console.log("Building indexes...");
      const sessionIndexes = rebuildAllSessionIndexes(mnemeDir);
      const decisionIndexes = rebuildAllDecisionIndexes(mnemeDir);
      let sessionCount = 0;
      for (const index of sessionIndexes.values()) {
        sessionCount += index.items.length;
      }
      let decisionCount = 0;
      for (const index of decisionIndexes.values()) {
        decisionCount += index.items.length;
      }
      console.log(
        `Indexed ${sessionCount} sessions, ${decisionCount} decisions`
      );
    }
  } catch (error) {
    console.warn("Failed to initialize indexes:", error);
  }
}
async function startServer(port, attempt = 1) {
  return new Promise((resolve, reject) => {
    const server = serve({
      fetch: app.fetch,
      port
    });
    server.on("error", (err) => {
      if (err.code === "EADDRINUSE" && attempt < maxPortAttempts) {
        console.log(`Port ${port} is in use, trying ${port + 1}...`);
        server.close();
        startServer(port + 1, attempt + 1).then(resolve).catch(reject);
      } else if (err.code === "EADDRINUSE") {
        reject(
          new Error(
            `Could not find an available port after ${maxPortAttempts} attempts`
          )
        );
      } else {
        reject(err);
      }
    });
    server.on("listening", () => {
      console.log(`
mneme dashboard`);
      console.log(`Project: ${getProjectRoot()}`);
      console.log(`URL: http://localhost:${port}
`);
      resolve();
    });
  });
}
startServer(requestedPort).catch((err) => {
  console.error("Failed to start server:", err.message);
  process.exit(1);
});
process.on("SIGINT", () => {
  console.log("\nShutting down...");
  process.exit(0);
});
process.on("SIGTERM", () => {
  process.exit(0);
});
