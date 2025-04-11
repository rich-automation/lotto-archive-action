'use strict';

var index = require('./index.js');
var chromiumBidi_bidiMapper = require('./chromium-bidi/bidiMapper.js');
require('./chromium-bidi/ActionDispatcher.js');
require('./chromium-bidi/protocol.js');
require('./chromium-bidi/assert.js');
require('./chromium-bidi/USKeyboardLayout.js');
require('./chromium-bidi/keyUtils.js');
require('os');
require('crypto');
require('fs');
require('path');
require('http');
require('https');
require('net');
require('tls');
require('events');
require('assert');
require('util');
require('string_decoder');
require('child_process');
require('timers');
require('stream');
require('buffer');
require('querystring');
require('stream/web');
require('node:stream');
require('node:util');
require('node:events');
require('worker_threads');
require('perf_hooks');
require('util/types');
require('async_hooks');
require('console');
require('url');
require('zlib');
require('diagnostics_channel');
require('fs/promises');
require('readline');
require('tty');
require('dns');
require('constants');
require('./vm2/index.js');
require('./vm2/main.js');
require('./vm2/bridge.js');
require('./vm2/script.js');
require('vm');
require('./vm2/compiler.js');
require('./vm2/transformer.js');
require('./vm2/vm.js');
require('./vm2/nodevm.js');
require('./vm2/resolver-compat.js');
require('./vm2/resolver.js');
require('./vm2/filesystem.js');
require('./vm2/builtin.js');
require('module');
require('process');
require('http2');
require('inspector');
require('chromium-bidi/lib/cjs/bidiMapper/BidiMapper');
require('chromium-bidi/lib/cjs/cdp/CdpConnection');
require('./chromium-bidi/BidiServer.js');
require('./chromium-bidi/EventEmitter.js');
require('./chromium-bidi/log.js');
require('./chromium-bidi/processingQueue.js');
require('./chromium-bidi/CommandProcessor.js');
require('./chromium-bidi/browsingContextProcessor.js');
require('./chromium-bidi/InputStateManager.js');
require('./chromium-bidi/InputState.js');
require('./chromium-bidi/Mutex.js');
require('./chromium-bidi/InputSource.js');
require('./chromium-bidi/PreloadScriptStorage.js');
require('./chromium-bidi/uuid.js');
require('./chromium-bidi/browsingContextImpl.js');
require('./chromium-bidi/unitConversions.js');
require('./chromium-bidi/deferred.js');
require('./chromium-bidi/realm.js');
require('./chromium-bidi/scriptEvaluator.js');
require('./chromium-bidi/cdpTarget.js');
require('./chromium-bidi/logManager.js');
require('./chromium-bidi/logHelper.js');
require('./chromium-bidi/networkProcessor.js');
require('./chromium-bidi/DefaultMap.js');
require('./chromium-bidi/networkRequest.js');
require('./chromium-bidi/OutgoingBidiMessage.js');
require('./chromium-bidi/browsingContextStorage.js');
require('./chromium-bidi/EventManager.js');
require('./chromium-bidi/buffer.js');
require('./chromium-bidi/idWrapper.js');
require('./chromium-bidi/SubscriptionManager.js');
require('./chromium-bidi/realmStorage.js');

/**
 * Copyright 2023 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/**
 * @internal
 */
class UnserializableError extends Error {
}
/**
 * @internal
 */
class BidiSerializer {
    static serializeNumber(arg) {
        let value;
        if (Object.is(arg, -0)) {
            value = '-0';
        }
        else if (Object.is(arg, Infinity)) {
            value = 'Infinity';
        }
        else if (Object.is(arg, -Infinity)) {
            value = '-Infinity';
        }
        else if (Object.is(arg, NaN)) {
            value = 'NaN';
        }
        else {
            value = arg;
        }
        return {
            type: 'number',
            value,
        };
    }
    static serializeObject(arg) {
        if (arg === null) {
            return {
                type: 'null',
            };
        }
        else if (Array.isArray(arg)) {
            const parsedArray = arg.map(subArg => {
                return BidiSerializer.serializeRemoveValue(subArg);
            });
            return {
                type: 'array',
                value: parsedArray,
            };
        }
        else if (index.isPlainObject(arg)) {
            try {
                JSON.stringify(arg);
            }
            catch (error) {
                if (error instanceof TypeError &&
                    error.message.startsWith('Converting circular structure to JSON')) {
                    error.message += ' Recursive objects are not allowed.';
                }
                throw error;
            }
            const parsedObject = [];
            for (const key in arg) {
                parsedObject.push([
                    BidiSerializer.serializeRemoveValue(key),
                    BidiSerializer.serializeRemoveValue(arg[key]),
                ]);
            }
            return {
                type: 'object',
                value: parsedObject,
            };
        }
        else if (index.isRegExp(arg)) {
            return {
                type: 'regexp',
                value: {
                    pattern: arg.source,
                    flags: arg.flags,
                },
            };
        }
        else if (index.isDate(arg)) {
            return {
                type: 'date',
                value: arg.toISOString(),
            };
        }
        throw new UnserializableError('Custom object sterilization not possible. Use plain objects instead.');
    }
    static serializeRemoveValue(arg) {
        switch (typeof arg) {
            case 'symbol':
            case 'function':
                throw new UnserializableError(`Unable to serializable ${typeof arg}`);
            case 'object':
                return BidiSerializer.serializeObject(arg);
            case 'undefined':
                return {
                    type: 'undefined',
                };
            case 'number':
                return BidiSerializer.serializeNumber(arg);
            case 'bigint':
                return {
                    type: 'bigint',
                    value: arg.toString(),
                };
            case 'string':
                return {
                    type: 'string',
                    value: arg,
                };
            case 'boolean':
                return {
                    type: 'boolean',
                    value: arg,
                };
        }
    }
    static serialize(arg, context) {
        // TODO: See use case of LazyArgs
        const objectHandle = arg && (arg instanceof JSHandle || arg instanceof ElementHandle)
            ? arg
            : null;
        if (objectHandle) {
            if (objectHandle.context() !== context) {
                throw new Error('JSHandles can be evaluated only in the context they were created!');
            }
            if (objectHandle.disposed) {
                throw new Error('JSHandle is disposed!');
            }
            return objectHandle.remoteValue();
        }
        return BidiSerializer.serializeRemoveValue(arg);
    }
    static deserializeNumber(value) {
        switch (value) {
            case '-0':
                return -0;
            case 'NaN':
                return NaN;
            case 'Infinity':
                return Infinity;
            case '-Infinity':
                return -Infinity;
            default:
                return value;
        }
    }
    static deserializeLocalValue(result) {
        switch (result.type) {
            case 'array':
                // TODO: Check expected output when value is undefined
                return result.value?.map(value => {
                    return BidiSerializer.deserializeLocalValue(value);
                });
            case 'set':
                // TODO: Check expected output when value is undefined
                return result.value.reduce((acc, value) => {
                    return acc.add(BidiSerializer.deserializeLocalValue(value));
                }, new Set());
            case 'object':
                if (result.value) {
                    return result.value.reduce((acc, tuple) => {
                        const { key, value } = BidiSerializer.deserializeTuple(tuple);
                        acc[key] = value;
                        return acc;
                    }, {});
                }
                break;
            case 'map':
                return result.value.reduce((acc, tuple) => {
                    const { key, value } = BidiSerializer.deserializeTuple(tuple);
                    return acc.set(key, value);
                }, new Map());
            case 'promise':
                return {};
            case 'regexp':
                return new RegExp(result.value.pattern, result.value.flags);
            case 'date':
                return new Date(result.value);
            case 'undefined':
                return undefined;
            case 'null':
                return null;
            case 'number':
                return BidiSerializer.deserializeNumber(result.value);
            case 'bigint':
                return BigInt(result.value);
            case 'boolean':
                return Boolean(result.value);
            case 'string':
                return result.value;
        }
        throw new UnserializableError(`Deserialization of type ${result.type} not supported.`);
    }
    static deserializeTuple([serializedKey, serializedValue]) {
        const key = typeof serializedKey === 'string'
            ? serializedKey
            : BidiSerializer.deserializeLocalValue(serializedKey);
        const value = BidiSerializer.deserializeLocalValue(serializedValue);
        return { key, value };
    }
    static deserialize(result) {
        if (!result) {
            index.debugError('Service did not produce a result.');
            return undefined;
        }
        try {
            return BidiSerializer.deserializeLocalValue(result);
        }
        catch (error) {
            if (error instanceof UnserializableError) {
                index.debugError(error.message);
                return undefined;
            }
            throw error;
        }
    }
}

/**
 * Copyright 2023 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/**
 * @internal
 */
const debugError = index.debug('puppeteer:error');
/**
 * @internal
 */
async function releaseReference(client, remoteReference) {
    if (!remoteReference.handle) {
        return;
    }
    await client.connection
        .send('script.disown', {
        target: { context: client.id },
        handles: [remoteReference.handle],
    })
        .catch((error) => {
        // Exceptions might happen in case of a page been navigated or closed.
        // Swallow these since they are harmless and we don't leak anything in this case.
        debugError(error);
    });
}
/**
 * @internal
 */
function createEvaluationError(details) {
    if (details.exception.type !== 'error') {
        return BidiSerializer.deserialize(details.exception);
    }
    const [name = '', ...parts] = details.text.split(': ');
    const message = parts.join(': ');
    const error = new Error(message);
    error.name = name;
    // The first line is this function which we ignore.
    const stackLines = [];
    if (details.stackTrace && stackLines.length < Error.stackTraceLimit) {
        for (const frame of details.stackTrace.callFrames.reverse()) {
            if (index.PuppeteerURL.isPuppeteerURL(frame.url) &&
                frame.url !== index.PuppeteerURL.INTERNAL_URL) {
                const url = index.PuppeteerURL.parse(frame.url);
                stackLines.unshift(`    at ${frame.functionName || url.functionName} (${url.functionName} at ${url.siteString}, <anonymous>:${frame.lineNumber}:${frame.columnNumber})`);
            }
            else {
                stackLines.push(`    at ${frame.functionName || '<anonymous>'} (${frame.url}:${frame.lineNumber}:${frame.columnNumber})`);
            }
            if (stackLines.length >= Error.stackTraceLimit) {
                break;
            }
        }
    }
    error.stack = [details.text, ...stackLines].join('\n');
    return error;
}

/**
 * Copyright 2023 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
var __classPrivateFieldSet$a = (undefined && undefined.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var __classPrivateFieldGet$a = (undefined && undefined.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _JSHandle_disposed, _JSHandle_context, _JSHandle_remoteValue;
class JSHandle extends index.JSHandle {
    constructor(context, remoteValue) {
        super();
        _JSHandle_disposed.set(this, false);
        _JSHandle_context.set(this, void 0);
        _JSHandle_remoteValue.set(this, void 0);
        __classPrivateFieldSet$a(this, _JSHandle_context, context, "f");
        __classPrivateFieldSet$a(this, _JSHandle_remoteValue, remoteValue, "f");
    }
    context() {
        return __classPrivateFieldGet$a(this, _JSHandle_context, "f");
    }
    get disposed() {
        return __classPrivateFieldGet$a(this, _JSHandle_disposed, "f");
    }
    async evaluate(pageFunction, ...args) {
        pageFunction = index.withSourcePuppeteerURLIfNone(this.evaluate.name, pageFunction);
        return await this.context().evaluate(pageFunction, this, ...args);
    }
    async evaluateHandle(pageFunction, ...args) {
        pageFunction = index.withSourcePuppeteerURLIfNone(this.evaluateHandle.name, pageFunction);
        return this.context().evaluateHandle(pageFunction, this, ...args);
    }
    async getProperty(propertyName) {
        return await this.evaluateHandle((object, propertyName) => {
            return object[propertyName];
        }, propertyName);
    }
    async getProperties() {
        // TODO(lightning00blade): Either include return of depth Handles in RemoteValue
        // or new BiDi command that returns array of remote value
        const keys = await this.evaluate(object => {
            return Object.getOwnPropertyNames(object);
        });
        const map = new Map();
        const results = await Promise.all(keys.map(key => {
            return this.getProperty(key);
        }));
        for (const [key, value] of Object.entries(keys)) {
            const handle = results[key];
            if (handle) {
                map.set(value, handle);
            }
        }
        return map;
    }
    async jsonValue() {
        const value = BidiSerializer.deserialize(__classPrivateFieldGet$a(this, _JSHandle_remoteValue, "f"));
        if (__classPrivateFieldGet$a(this, _JSHandle_remoteValue, "f").type !== 'undefined' && value === undefined) {
            throw new Error('Could not serialize referenced object');
        }
        return value;
    }
    asElement() {
        return null;
    }
    async dispose() {
        if (__classPrivateFieldGet$a(this, _JSHandle_disposed, "f")) {
            return;
        }
        __classPrivateFieldSet$a(this, _JSHandle_disposed, true, "f");
        if ('handle' in __classPrivateFieldGet$a(this, _JSHandle_remoteValue, "f")) {
            await releaseReference(__classPrivateFieldGet$a(this, _JSHandle_context, "f"), __classPrivateFieldGet$a(this, _JSHandle_remoteValue, "f"));
        }
    }
    get isPrimitiveValue() {
        switch (__classPrivateFieldGet$a(this, _JSHandle_remoteValue, "f").type) {
            case 'string':
            case 'number':
            case 'bigint':
            case 'boolean':
            case 'undefined':
            case 'null':
                return true;
            default:
                return false;
        }
    }
    toString() {
        if (this.isPrimitiveValue) {
            return 'JSHandle:' + BidiSerializer.deserialize(__classPrivateFieldGet$a(this, _JSHandle_remoteValue, "f"));
        }
        return 'JSHandle@' + __classPrivateFieldGet$a(this, _JSHandle_remoteValue, "f").type;
    }
    get id() {
        return 'handle' in __classPrivateFieldGet$a(this, _JSHandle_remoteValue, "f") ? __classPrivateFieldGet$a(this, _JSHandle_remoteValue, "f").handle : undefined;
    }
    remoteValue() {
        return __classPrivateFieldGet$a(this, _JSHandle_remoteValue, "f");
    }
}
_JSHandle_disposed = new WeakMap(), _JSHandle_context = new WeakMap(), _JSHandle_remoteValue = new WeakMap();

/**
 * Copyright 2023 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/**
 * @internal
 */
class ElementHandle extends index.ElementHandle {
    constructor(context, remoteValue) {
        super(new JSHandle(context, remoteValue));
    }
    context() {
        return this.handle.context();
    }
    get isPrimitiveValue() {
        return this.handle.isPrimitiveValue;
    }
    remoteValue() {
        return this.handle.remoteValue();
    }
}

var __classPrivateFieldSet$9 = (undefined && undefined.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var __classPrivateFieldGet$9 = (undefined && undefined.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _BrowsingContext_instances, _BrowsingContext_timeoutSettings, _BrowsingContext_id, _BrowsingContext_url, _BrowsingContext_evaluate;
const SOURCE_URL_REGEX = /^[\040\t]*\/\/[@#] sourceURL=\s*(\S*?)\s*$/m;
const getSourceUrlComment = (url) => {
    return `//# sourceURL=${url}`;
};
/**
 * @internal
 */
const lifeCycleToSubscribedEvent = new Map([
    ['load', 'browsingContext.load'],
    ['domcontentloaded', 'browsingContext.domContentLoaded'],
]);
/**
 * @internal
 */
const lifeCycleToReadinessState = new Map([
    ['load', 'complete'],
    ['domcontentloaded', 'interactive'],
]);
/**
 * @internal
 */
class BrowsingContext extends index.EventEmitter {
    constructor(connection, timeoutSettings, info) {
        super();
        _BrowsingContext_instances.add(this);
        _BrowsingContext_timeoutSettings.set(this, void 0);
        _BrowsingContext_id.set(this, void 0);
        _BrowsingContext_url.set(this, 'about:blank');
        this.connection = connection;
        __classPrivateFieldSet$9(this, _BrowsingContext_timeoutSettings, timeoutSettings, "f");
        __classPrivateFieldSet$9(this, _BrowsingContext_id, info.context, "f");
    }
    get url() {
        return __classPrivateFieldGet$9(this, _BrowsingContext_url, "f");
    }
    get id() {
        return __classPrivateFieldGet$9(this, _BrowsingContext_id, "f");
    }
    async goto(url, options = {}) {
        const { waitUntil = 'load', timeout = __classPrivateFieldGet$9(this, _BrowsingContext_timeoutSettings, "f").navigationTimeout(), } = options;
        const readinessState = lifeCycleToReadinessState.get(getWaitUntilSingle(waitUntil));
        try {
            const { result } = await index.waitWithTimeout(this.connection.send('browsingContext.navigate', {
                url: url,
                context: __classPrivateFieldGet$9(this, _BrowsingContext_id, "f"),
                wait: readinessState,
            }), 'Navigation', timeout);
            __classPrivateFieldSet$9(this, _BrowsingContext_url, result.url, "f");
            return result.navigation;
        }
        catch (error) {
            if (error instanceof index.ProtocolError) {
                error.message += ` at ${url}`;
            }
            else if (error instanceof index.TimeoutError) {
                error.message = 'Navigation timeout of ' + timeout + ' ms exceeded';
            }
            throw error;
        }
    }
    async reload(options = {}) {
        const { waitUntil = 'load', timeout = __classPrivateFieldGet$9(this, _BrowsingContext_timeoutSettings, "f").navigationTimeout(), } = options;
        const readinessState = lifeCycleToReadinessState.get(getWaitUntilSingle(waitUntil));
        await index.waitWithTimeout(this.connection.send('browsingContext.reload', {
            context: __classPrivateFieldGet$9(this, _BrowsingContext_id, "f"),
            wait: readinessState,
        }), 'Navigation', timeout);
    }
    async evaluateHandle(pageFunction, ...args) {
        return __classPrivateFieldGet$9(this, _BrowsingContext_instances, "m", _BrowsingContext_evaluate).call(this, false, pageFunction, ...args);
    }
    async evaluate(pageFunction, ...args) {
        return __classPrivateFieldGet$9(this, _BrowsingContext_instances, "m", _BrowsingContext_evaluate).call(this, true, pageFunction, ...args);
    }
    async setContent(html, options) {
        const { waitUntil = 'load', timeout = __classPrivateFieldGet$9(this, _BrowsingContext_timeoutSettings, "f").navigationTimeout(), } = options;
        const waitUntilCommand = lifeCycleToSubscribedEvent.get(getWaitUntilSingle(waitUntil));
        await Promise.all([
            index.setPageContent(this, html),
            index.waitWithTimeout(new Promise(resolve => {
                this.once(waitUntilCommand, () => {
                    resolve();
                });
            }), waitUntilCommand, timeout),
        ]);
    }
    async content() {
        return await this.evaluate(() => {
            let retVal = '';
            if (document.doctype) {
                retVal = new XMLSerializer().serializeToString(document.doctype);
            }
            if (document.documentElement) {
                retVal += document.documentElement.outerHTML;
            }
            return retVal;
        });
    }
    async sendCDPCommand(method, params = {}) {
        const session = await this.connection.send('cdp.getSession', {
            context: __classPrivateFieldGet$9(this, _BrowsingContext_id, "f"),
        });
        // TODO: remove any once chromium-bidi types are updated.
        const sessionId = session.result.cdpSession;
        return await this.connection.send('cdp.sendCommand', {
            cdpMethod: method,
            cdpParams: params,
            cdpSession: sessionId,
        });
    }
    dispose() {
        this.removeAllListeners();
        this.connection.unregisterBrowsingContexts(__classPrivateFieldGet$9(this, _BrowsingContext_id, "f"));
    }
    title() {
        return this.evaluate(() => {
            return document.title;
        });
    }
}
_BrowsingContext_timeoutSettings = new WeakMap(), _BrowsingContext_id = new WeakMap(), _BrowsingContext_url = new WeakMap(), _BrowsingContext_instances = new WeakSet(), _BrowsingContext_evaluate = async function _BrowsingContext_evaluate(returnByValue, pageFunction, ...args) {
    const sourceUrlComment = getSourceUrlComment(index.getSourcePuppeteerURLIfAvailable(pageFunction)?.toString() ??
        index.PuppeteerURL.INTERNAL_URL);
    let responsePromise;
    const resultOwnership = returnByValue ? 'none' : 'root';
    if (index.isString(pageFunction)) {
        const expression = SOURCE_URL_REGEX.test(pageFunction)
            ? pageFunction
            : `${pageFunction}\n${sourceUrlComment}\n`;
        responsePromise = this.connection.send('script.evaluate', {
            expression,
            target: { context: __classPrivateFieldGet$9(this, _BrowsingContext_id, "f") },
            resultOwnership,
            awaitPromise: true,
        });
    }
    else {
        let functionDeclaration = index.stringifyFunction(pageFunction);
        functionDeclaration = SOURCE_URL_REGEX.test(functionDeclaration)
            ? functionDeclaration
            : `${functionDeclaration}\n${sourceUrlComment}\n`;
        responsePromise = this.connection.send('script.callFunction', {
            functionDeclaration,
            arguments: await Promise.all(args.map(arg => {
                return BidiSerializer.serialize(arg, this);
            })),
            target: { context: __classPrivateFieldGet$9(this, _BrowsingContext_id, "f") },
            resultOwnership,
            awaitPromise: true,
        });
    }
    const { result } = await responsePromise;
    if ('type' in result && result.type === 'exception') {
        throw createEvaluationError(result.exceptionDetails);
    }
    return returnByValue
        ? BidiSerializer.deserialize(result.result)
        : getBidiHandle(this, result.result);
};
/**
 * @internal
 */
function getBidiHandle(context, result) {
    if (result.type === 'node' || result.type === 'window') {
        return new ElementHandle(context, result);
    }
    return new JSHandle(context, result);
}
/**
 * @internal
 */
function getWaitUntilSingle(event) {
    if (Array.isArray(event) && event.length > 1) {
        throw new Error('BiDi support only single `waitUntil` argument');
    }
    const waitUntilSingle = Array.isArray(event)
        ? event.find(lifecycle => {
            return lifecycle === 'domcontentloaded' || lifecycle === 'load';
        })
        : event;
    if (waitUntilSingle === 'networkidle0' ||
        waitUntilSingle === 'networkidle2') {
        throw new Error(`BiDi does not support 'waitUntil' ${waitUntilSingle}`);
    }
    index.assert(waitUntilSingle, `Invalid waitUntil option ${waitUntilSingle}`);
    return waitUntilSingle;
}

/**
 * Copyright 2023 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
var __classPrivateFieldSet$8 = (undefined && undefined.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var __classPrivateFieldGet$8 = (undefined && undefined.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _Frame_page, _Frame_context;
/**
 * Puppeteer's Frame class could be viewed as a BiDi BrowsingContext implementation
 * @internal
 */
class Frame extends index.Frame {
    constructor(page, context, parentId) {
        super();
        _Frame_page.set(this, void 0);
        _Frame_context.set(this, void 0);
        __classPrivateFieldSet$8(this, _Frame_page, page, "f");
        __classPrivateFieldSet$8(this, _Frame_context, context, "f");
        this._id = __classPrivateFieldGet$8(this, _Frame_context, "f").id;
        this._parentId = parentId ?? undefined;
    }
    page() {
        return __classPrivateFieldGet$8(this, _Frame_page, "f");
    }
    name() {
        return this._name || '';
    }
    url() {
        return __classPrivateFieldGet$8(this, _Frame_context, "f").url;
    }
    parentFrame() {
        return __classPrivateFieldGet$8(this, _Frame_page, "f").frame(this._parentId ?? '');
    }
    childFrames() {
        return __classPrivateFieldGet$8(this, _Frame_page, "f").childFrames(__classPrivateFieldGet$8(this, _Frame_context, "f").id);
    }
    async evaluateHandle(pageFunction, ...args) {
        return __classPrivateFieldGet$8(this, _Frame_context, "f").evaluateHandle(pageFunction, ...args);
    }
    async evaluate(pageFunction, ...args) {
        return __classPrivateFieldGet$8(this, _Frame_context, "f").evaluate(pageFunction, ...args);
    }
    async goto(url, options) {
        const navigationId = await __classPrivateFieldGet$8(this, _Frame_context, "f").goto(url, options);
        return __classPrivateFieldGet$8(this, _Frame_page, "f").getNavigationResponse(navigationId);
    }
    setContent(html, options) {
        return __classPrivateFieldGet$8(this, _Frame_context, "f").setContent(html, options);
    }
    content() {
        return __classPrivateFieldGet$8(this, _Frame_context, "f").content();
    }
    title() {
        return __classPrivateFieldGet$8(this, _Frame_context, "f").title();
    }
    context() {
        return __classPrivateFieldGet$8(this, _Frame_context, "f");
    }
    dispose() {
        __classPrivateFieldGet$8(this, _Frame_context, "f").dispose();
    }
}
_Frame_page = new WeakMap(), _Frame_context = new WeakMap();

var __classPrivateFieldSet$7 = (undefined && undefined.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var __classPrivateFieldGet$7 = (undefined && undefined.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _HTTPRequest_url, _HTTPRequest_resourceType, _HTTPRequest_method, _HTTPRequest_postData, _HTTPRequest_headers, _HTTPRequest_initiator, _HTTPRequest_frame;
/**
 * @internal
 */
class HTTPRequest extends index.HTTPRequest {
    constructor(event, frame, redirectChain) {
        super();
        this._response = null;
        _HTTPRequest_url.set(this, void 0);
        _HTTPRequest_resourceType.set(this, void 0);
        _HTTPRequest_method.set(this, void 0);
        _HTTPRequest_postData.set(this, void 0);
        _HTTPRequest_headers.set(this, {});
        _HTTPRequest_initiator.set(this, void 0);
        _HTTPRequest_frame.set(this, void 0);
        __classPrivateFieldSet$7(this, _HTTPRequest_url, event.request.url, "f");
        __classPrivateFieldSet$7(this, _HTTPRequest_resourceType, event.initiator.type.toLowerCase(), "f");
        __classPrivateFieldSet$7(this, _HTTPRequest_method, event.request.method, "f");
        __classPrivateFieldSet$7(this, _HTTPRequest_postData, undefined, "f");
        __classPrivateFieldSet$7(this, _HTTPRequest_initiator, event.initiator, "f");
        __classPrivateFieldSet$7(this, _HTTPRequest_frame, frame, "f");
        this._requestId = event.request.request;
        this._redirectChain = redirectChain ?? [];
        this._navigationId = event.navigation;
        for (const { name, value } of event.request.headers) {
            // TODO: How to handle Binary Headers
            // https://w3c.github.io/webdriver-bidi/#type-network-Header
            if (value) {
                __classPrivateFieldGet$7(this, _HTTPRequest_headers, "f")[name.toLowerCase()] = value;
            }
        }
    }
    url() {
        return __classPrivateFieldGet$7(this, _HTTPRequest_url, "f");
    }
    resourceType() {
        return __classPrivateFieldGet$7(this, _HTTPRequest_resourceType, "f");
    }
    method() {
        return __classPrivateFieldGet$7(this, _HTTPRequest_method, "f");
    }
    postData() {
        return __classPrivateFieldGet$7(this, _HTTPRequest_postData, "f");
    }
    headers() {
        return __classPrivateFieldGet$7(this, _HTTPRequest_headers, "f");
    }
    response() {
        return this._response;
    }
    isNavigationRequest() {
        return Boolean(this._navigationId);
    }
    initiator() {
        return __classPrivateFieldGet$7(this, _HTTPRequest_initiator, "f");
    }
    redirectChain() {
        return this._redirectChain.slice();
    }
    enqueueInterceptAction(pendingHandler) {
        // Execute the handler when interception is not supported
        void pendingHandler();
    }
    frame() {
        return __classPrivateFieldGet$7(this, _HTTPRequest_frame, "f");
    }
}
_HTTPRequest_url = new WeakMap(), _HTTPRequest_resourceType = new WeakMap(), _HTTPRequest_method = new WeakMap(), _HTTPRequest_postData = new WeakMap(), _HTTPRequest_headers = new WeakMap(), _HTTPRequest_initiator = new WeakMap(), _HTTPRequest_frame = new WeakMap();

var __classPrivateFieldSet$6 = (undefined && undefined.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var __classPrivateFieldGet$6 = (undefined && undefined.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _HTTPResponse_request, _HTTPResponse_remoteAddress, _HTTPResponse_status, _HTTPResponse_statusText, _HTTPResponse_url, _HTTPResponse_fromCache, _HTTPResponse_headers, _HTTPResponse_timings;
/**
 * @internal
 */
class HTTPResponse extends index.HTTPResponse {
    constructor(request, responseEvent) {
        super();
        _HTTPResponse_request.set(this, void 0);
        _HTTPResponse_remoteAddress.set(this, void 0);
        _HTTPResponse_status.set(this, void 0);
        _HTTPResponse_statusText.set(this, void 0);
        _HTTPResponse_url.set(this, void 0);
        _HTTPResponse_fromCache.set(this, void 0);
        _HTTPResponse_headers.set(this, {});
        _HTTPResponse_timings.set(this, void 0);
        const { response } = responseEvent;
        __classPrivateFieldSet$6(this, _HTTPResponse_request, request, "f");
        __classPrivateFieldSet$6(this, _HTTPResponse_remoteAddress, {
            ip: '',
            port: -1,
        }, "f");
        __classPrivateFieldSet$6(this, _HTTPResponse_url, response.url, "f");
        __classPrivateFieldSet$6(this, _HTTPResponse_fromCache, response.fromCache, "f");
        __classPrivateFieldSet$6(this, _HTTPResponse_status, response.status, "f");
        __classPrivateFieldSet$6(this, _HTTPResponse_statusText, response.statusText, "f");
        // TODO: update once BiDi has types
        __classPrivateFieldSet$6(this, _HTTPResponse_timings, response.timings ?? null, "f");
        // TODO: Removed once the Firefox implementation is compliant with https://w3c.github.io/webdriver-bidi/#get-the-response-data.
        for (const header of response.headers || []) {
            __classPrivateFieldGet$6(this, _HTTPResponse_headers, "f")[header.name] = header.value ?? '';
        }
    }
    remoteAddress() {
        return __classPrivateFieldGet$6(this, _HTTPResponse_remoteAddress, "f");
    }
    url() {
        return __classPrivateFieldGet$6(this, _HTTPResponse_url, "f");
    }
    status() {
        return __classPrivateFieldGet$6(this, _HTTPResponse_status, "f");
    }
    statusText() {
        return __classPrivateFieldGet$6(this, _HTTPResponse_statusText, "f");
    }
    headers() {
        return __classPrivateFieldGet$6(this, _HTTPResponse_headers, "f");
    }
    request() {
        return __classPrivateFieldGet$6(this, _HTTPResponse_request, "f");
    }
    fromCache() {
        return __classPrivateFieldGet$6(this, _HTTPResponse_fromCache, "f");
    }
    timing() {
        return __classPrivateFieldGet$6(this, _HTTPResponse_timings, "f");
    }
}
_HTTPResponse_request = new WeakMap(), _HTTPResponse_remoteAddress = new WeakMap(), _HTTPResponse_status = new WeakMap(), _HTTPResponse_statusText = new WeakMap(), _HTTPResponse_url = new WeakMap(), _HTTPResponse_fromCache = new WeakMap(), _HTTPResponse_headers = new WeakMap(), _HTTPResponse_timings = new WeakMap();

/**
 * Copyright 2023 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
var __classPrivateFieldSet$5 = (undefined && undefined.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var __classPrivateFieldGet$5 = (undefined && undefined.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _NetworkManager_instances, _NetworkManager_connection, _NetworkManager_page, _NetworkManager_subscribedEvents, _NetworkManager_requestMap, _NetworkManager_navigationMap, _NetworkManager_onBeforeRequestSent, _NetworkManager_onResponseStarted, _NetworkManager_onResponseCompleted, _NetworkManager_onFetchError;
/**
 * @internal
 */
class NetworkManager extends index.EventEmitter {
    constructor(connection, page) {
        super();
        _NetworkManager_instances.add(this);
        _NetworkManager_connection.set(this, void 0);
        _NetworkManager_page.set(this, void 0);
        _NetworkManager_subscribedEvents.set(this, new Map([
            ['network.beforeRequestSent', __classPrivateFieldGet$5(this, _NetworkManager_instances, "m", _NetworkManager_onBeforeRequestSent).bind(this)],
            ['network.responseStarted', __classPrivateFieldGet$5(this, _NetworkManager_instances, "m", _NetworkManager_onResponseStarted).bind(this)],
            ['network.responseCompleted', __classPrivateFieldGet$5(this, _NetworkManager_instances, "m", _NetworkManager_onResponseCompleted).bind(this)],
            ['network.fetchError', __classPrivateFieldGet$5(this, _NetworkManager_instances, "m", _NetworkManager_onFetchError).bind(this)],
        ]));
        _NetworkManager_requestMap.set(this, new Map());
        _NetworkManager_navigationMap.set(this, new Map());
        __classPrivateFieldSet$5(this, _NetworkManager_connection, connection, "f");
        __classPrivateFieldSet$5(this, _NetworkManager_page, page, "f");
        // TODO: Subscribe to the Frame indivutally
        for (const [event, subscriber] of __classPrivateFieldGet$5(this, _NetworkManager_subscribedEvents, "f")) {
            __classPrivateFieldGet$5(this, _NetworkManager_connection, "f").on(event, subscriber);
        }
    }
    getNavigationResponse(navigationId) {
        return __classPrivateFieldGet$5(this, _NetworkManager_navigationMap, "f").get(navigationId ?? '') ?? null;
    }
    inFlightRequestsCount() {
        let inFlightRequestCounter = 0;
        for (const request of __classPrivateFieldGet$5(this, _NetworkManager_requestMap, "f").values()) {
            if (!request.response() || request._failureText) {
                inFlightRequestCounter++;
            }
        }
        return inFlightRequestCounter;
    }
    dispose() {
        this.removeAllListeners();
        __classPrivateFieldGet$5(this, _NetworkManager_requestMap, "f").clear();
        __classPrivateFieldGet$5(this, _NetworkManager_navigationMap, "f").clear();
        for (const [event, subscriber] of __classPrivateFieldGet$5(this, _NetworkManager_subscribedEvents, "f")) {
            __classPrivateFieldGet$5(this, _NetworkManager_connection, "f").off(event, subscriber);
        }
    }
}
_NetworkManager_connection = new WeakMap(), _NetworkManager_page = new WeakMap(), _NetworkManager_subscribedEvents = new WeakMap(), _NetworkManager_requestMap = new WeakMap(), _NetworkManager_navigationMap = new WeakMap(), _NetworkManager_instances = new WeakSet(), _NetworkManager_onBeforeRequestSent = function _NetworkManager_onBeforeRequestSent(event) {
    const frame = __classPrivateFieldGet$5(this, _NetworkManager_page, "f").frame(event.context ?? '');
    if (!frame) {
        return;
    }
    const request = __classPrivateFieldGet$5(this, _NetworkManager_requestMap, "f").get(event.request.request);
    let upsertRequest;
    if (request) {
        const requestChain = request._redirectChain;
        upsertRequest = new HTTPRequest(event, frame, requestChain);
    }
    else {
        upsertRequest = new HTTPRequest(event, frame, []);
    }
    __classPrivateFieldGet$5(this, _NetworkManager_requestMap, "f").set(event.request.request, upsertRequest);
    this.emit(index.NetworkManagerEmittedEvents.Request, upsertRequest);
}, _NetworkManager_onResponseStarted = function _NetworkManager_onResponseStarted(_event) { }, _NetworkManager_onResponseCompleted = function _NetworkManager_onResponseCompleted(event) {
    const request = __classPrivateFieldGet$5(this, _NetworkManager_requestMap, "f").get(event.request.request);
    if (request) {
        const response = new HTTPResponse(request, event);
        request._response = response;
        if (event.navigation) {
            __classPrivateFieldGet$5(this, _NetworkManager_navigationMap, "f").set(event.navigation, response);
        }
        if (response.fromCache()) {
            this.emit(index.NetworkManagerEmittedEvents.RequestServedFromCache, request);
        }
        this.emit(index.NetworkManagerEmittedEvents.Response, response);
        this.emit(index.NetworkManagerEmittedEvents.RequestFinished, request);
    }
}, _NetworkManager_onFetchError = function _NetworkManager_onFetchError(event) {
    const request = __classPrivateFieldGet$5(this, _NetworkManager_requestMap, "f").get(event.request.request);
    if (!request) {
        return;
    }
    request._failureText = event.errorText;
    this.emit(index.NetworkManagerEmittedEvents.RequestFailed, request);
};

/**
 * Copyright 2022 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
var __classPrivateFieldSet$4 = (undefined && undefined.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var __classPrivateFieldGet$4 = (undefined && undefined.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _Page_instances, _Page_timeoutSettings, _Page_connection, _Page_frameTree, _Page_networkManager, _Page_viewport, _Page_closedDeferred, _Page_subscribedEvents, _Page_networkManagerEvents, _Page_onFrameAttached, _Page_onFrameNavigated, _Page_onFrameDetached, _Page_removeFramesRecursively, _Page_onLogEntryAdded;
/**
 * @internal
 */
class Page extends index.Page {
    constructor(connection, info) {
        super();
        _Page_instances.add(this);
        _Page_timeoutSettings.set(this, new index.TimeoutSettings());
        _Page_connection.set(this, void 0);
        _Page_frameTree.set(this, new index.FrameTree());
        _Page_networkManager.set(this, void 0);
        _Page_viewport.set(this, null);
        _Page_closedDeferred.set(this, index.createDeferred());
        _Page_subscribedEvents.set(this, new Map([
            ['log.entryAdded', __classPrivateFieldGet$4(this, _Page_instances, "m", _Page_onLogEntryAdded).bind(this)],
            [
                'browsingContext.load',
                () => {
                    return this.emit("load" /* PageEmittedEvents.Load */);
                },
            ],
            [
                'browsingContext.domContentLoaded',
                () => {
                    return this.emit("domcontentloaded" /* PageEmittedEvents.DOMContentLoaded */);
                },
            ],
            ['browsingContext.contextCreated', __classPrivateFieldGet$4(this, _Page_instances, "m", _Page_onFrameAttached).bind(this)],
            ['browsingContext.contextDestroyed', __classPrivateFieldGet$4(this, _Page_instances, "m", _Page_onFrameDetached).bind(this)],
            ['browsingContext.fragmentNavigated', __classPrivateFieldGet$4(this, _Page_instances, "m", _Page_onFrameNavigated).bind(this)],
        ]));
        _Page_networkManagerEvents.set(this, new Map([
            [
                index.NetworkManagerEmittedEvents.Request,
                event => {
                    return this.emit("request" /* PageEmittedEvents.Request */, event);
                },
            ],
            [
                index.NetworkManagerEmittedEvents.RequestServedFromCache,
                event => {
                    return this.emit("requestservedfromcache" /* PageEmittedEvents.RequestServedFromCache */, event);
                },
            ],
            [
                index.NetworkManagerEmittedEvents.RequestFailed,
                event => {
                    return this.emit("requestfailed" /* PageEmittedEvents.RequestFailed */, event);
                },
            ],
            [
                index.NetworkManagerEmittedEvents.RequestFinished,
                event => {
                    return this.emit("requestfinished" /* PageEmittedEvents.RequestFinished */, event);
                },
            ],
            [
                index.NetworkManagerEmittedEvents.Response,
                event => {
                    return this.emit("response" /* PageEmittedEvents.Response */, event);
                },
            ],
        ]));
        __classPrivateFieldSet$4(this, _Page_connection, connection, "f");
        __classPrivateFieldSet$4(this, _Page_networkManager, new NetworkManager(connection, this), "f");
        __classPrivateFieldGet$4(this, _Page_instances, "m", _Page_onFrameAttached).call(this, {
            ...info,
            url: 'about:blank',
            children: [],
        });
        for (const [event, subscriber] of __classPrivateFieldGet$4(this, _Page_subscribedEvents, "f")) {
            __classPrivateFieldGet$4(this, _Page_connection, "f").on(event, subscriber);
        }
        for (const [event, subscriber] of __classPrivateFieldGet$4(this, _Page_networkManagerEvents, "f")) {
            __classPrivateFieldGet$4(this, _Page_networkManager, "f").on(event, subscriber);
        }
    }
    mainFrame() {
        const mainFrame = __classPrivateFieldGet$4(this, _Page_frameTree, "f").getMainFrame();
        index.assert(mainFrame, 'Requesting main frame too early!');
        return mainFrame;
    }
    frames() {
        return Array.from(__classPrivateFieldGet$4(this, _Page_frameTree, "f").frames());
    }
    frame(frameId) {
        return __classPrivateFieldGet$4(this, _Page_frameTree, "f").getById(frameId ?? '') || null;
    }
    childFrames(frameId) {
        return __classPrivateFieldGet$4(this, _Page_frameTree, "f").childFrames(frameId);
    }
    getNavigationResponse(id) {
        return __classPrivateFieldGet$4(this, _Page_networkManager, "f").getNavigationResponse(id);
    }
    async close() {
        if (__classPrivateFieldGet$4(this, _Page_closedDeferred, "f").finished()) {
            return;
        }
        __classPrivateFieldGet$4(this, _Page_closedDeferred, "f").resolve(new index.TargetCloseError('Page closed!'));
        this.removeAllListeners();
        __classPrivateFieldGet$4(this, _Page_networkManager, "f").dispose();
        await __classPrivateFieldGet$4(this, _Page_connection, "f").send('browsingContext.close', {
            context: this.mainFrame()._id,
        });
    }
    async evaluateHandle(pageFunction, ...args) {
        pageFunction = index.withSourcePuppeteerURLIfNone(this.evaluateHandle.name, pageFunction);
        return this.mainFrame().evaluateHandle(pageFunction, ...args);
    }
    async evaluate(pageFunction, ...args) {
        pageFunction = index.withSourcePuppeteerURLIfNone(this.evaluate.name, pageFunction);
        return this.mainFrame().evaluate(pageFunction, ...args);
    }
    async goto(url, options) {
        return this.mainFrame().goto(url, options);
    }
    async reload(options) {
        const [response] = await Promise.all([
            this.waitForResponse(response => {
                return (response.request().isNavigationRequest() &&
                    response.url() === this.url());
            }),
            this.mainFrame().context().reload(options),
        ]);
        return response;
    }
    url() {
        return this.mainFrame().url();
    }
    setDefaultNavigationTimeout(timeout) {
        __classPrivateFieldGet$4(this, _Page_timeoutSettings, "f").setDefaultNavigationTimeout(timeout);
    }
    setDefaultTimeout(timeout) {
        __classPrivateFieldGet$4(this, _Page_timeoutSettings, "f").setDefaultTimeout(timeout);
    }
    getDefaultTimeout() {
        return __classPrivateFieldGet$4(this, _Page_timeoutSettings, "f").timeout();
    }
    async setContent(html, options = {}) {
        await this.mainFrame().setContent(html, options);
    }
    async content() {
        return this.mainFrame().content();
    }
    async setViewport(viewport) {
        // TODO: use BiDi commands when available.
        const mobile = false;
        const width = viewport.width;
        const height = viewport.height;
        const deviceScaleFactor = 1;
        const screenOrientation = { angle: 0, type: 'portraitPrimary' };
        await this.mainFrame()
            .context()
            .sendCDPCommand('Emulation.setDeviceMetricsOverride', {
            mobile,
            width,
            height,
            deviceScaleFactor,
            screenOrientation,
        });
        __classPrivateFieldSet$4(this, _Page_viewport, viewport, "f");
    }
    viewport() {
        return __classPrivateFieldGet$4(this, _Page_viewport, "f");
    }
    async pdf(options = {}) {
        const { path = undefined } = options;
        const { printBackground: background, margin, landscape, width, height, pageRanges, scale, preferCSSPageSize, timeout, } = this._getPDFOptions(options, 'cm');
        const { result } = await index.waitWithTimeout(__classPrivateFieldGet$4(this, _Page_connection, "f").send('browsingContext.print', {
            context: this.mainFrame()._id,
            background,
            margin,
            orientation: landscape ? 'landscape' : 'portrait',
            page: {
                width,
                height,
            },
            pageRanges: pageRanges.split(', '),
            scale,
            shrinkToFit: !preferCSSPageSize,
        }), 'browsingContext.print', timeout);
        const buffer = Buffer.from(result.data, 'base64');
        await this._maybeWriteBufferToFile(path, buffer);
        return buffer;
    }
    async createPDFStream(options) {
        const buffer = await this.pdf(options);
        try {
            const { Readable } = await import('stream');
            return Readable.from(buffer);
        }
        catch (error) {
            if (error instanceof TypeError) {
                throw new Error('Can only pass a file path in a Node-like environment.');
            }
            throw error;
        }
    }
    async screenshot(options = {}) {
        const { path = undefined, encoding, ...args } = options;
        if (Object.keys(args).length >= 1) {
            throw new Error('BiDi only supports "encoding" and "path" options');
        }
        const { result } = await __classPrivateFieldGet$4(this, _Page_connection, "f").send('browsingContext.captureScreenshot', {
            context: this.mainFrame()._id,
        });
        if (encoding === 'base64') {
            return result.data;
        }
        const buffer = Buffer.from(result.data, 'base64');
        await this._maybeWriteBufferToFile(path, buffer);
        return buffer;
    }
    waitForRequest(urlOrPredicate, options = {}) {
        const { timeout = __classPrivateFieldGet$4(this, _Page_timeoutSettings, "f").timeout() } = options;
        return index.waitForEvent(__classPrivateFieldGet$4(this, _Page_networkManager, "f"), index.NetworkManagerEmittedEvents.Request, async (request) => {
            if (index.isString(urlOrPredicate)) {
                return urlOrPredicate === request.url();
            }
            if (typeof urlOrPredicate === 'function') {
                return !!(await urlOrPredicate(request));
            }
            return false;
        }, timeout, __classPrivateFieldGet$4(this, _Page_closedDeferred, "f").valueOrThrow());
    }
    waitForResponse(urlOrPredicate, options = {}) {
        const { timeout = __classPrivateFieldGet$4(this, _Page_timeoutSettings, "f").timeout() } = options;
        return index.waitForEvent(__classPrivateFieldGet$4(this, _Page_networkManager, "f"), index.NetworkManagerEmittedEvents.Response, async (response) => {
            if (index.isString(urlOrPredicate)) {
                return urlOrPredicate === response.url();
            }
            if (typeof urlOrPredicate === 'function') {
                return !!(await urlOrPredicate(response));
            }
            return false;
        }, timeout, __classPrivateFieldGet$4(this, _Page_closedDeferred, "f").valueOrThrow());
    }
    async waitForNetworkIdle(options = {}) {
        const { idleTime = 500, timeout = __classPrivateFieldGet$4(this, _Page_timeoutSettings, "f").timeout() } = options;
        await this._waitForNetworkIdle(__classPrivateFieldGet$4(this, _Page_networkManager, "f"), idleTime, timeout, __classPrivateFieldGet$4(this, _Page_closedDeferred, "f"));
    }
    title() {
        return this.mainFrame().title();
    }
}
_Page_timeoutSettings = new WeakMap(), _Page_connection = new WeakMap(), _Page_frameTree = new WeakMap(), _Page_networkManager = new WeakMap(), _Page_viewport = new WeakMap(), _Page_closedDeferred = new WeakMap(), _Page_subscribedEvents = new WeakMap(), _Page_networkManagerEvents = new WeakMap(), _Page_instances = new WeakSet(), _Page_onFrameAttached = function _Page_onFrameAttached(info) {
    if (!this.frame(info.context) &&
        (this.frame(info.parent ?? '') || !__classPrivateFieldGet$4(this, _Page_frameTree, "f").getMainFrame())) {
        const context = new BrowsingContext(__classPrivateFieldGet$4(this, _Page_connection, "f"), __classPrivateFieldGet$4(this, _Page_timeoutSettings, "f"), info);
        __classPrivateFieldGet$4(this, _Page_connection, "f").registerBrowsingContexts(context);
        const frame = new Frame(this, context, info.parent);
        __classPrivateFieldGet$4(this, _Page_frameTree, "f").addFrame(frame);
        this.emit(index.FrameManagerEmittedEvents.FrameAttached, frame);
    }
}, _Page_onFrameNavigated = async function _Page_onFrameNavigated(info) {
    const frameId = info.context;
    let frame = this.frame(frameId);
    // Detach all child frames first.
    if (frame) {
        for (const child of frame.childFrames()) {
            __classPrivateFieldGet$4(this, _Page_instances, "m", _Page_removeFramesRecursively).call(this, child);
        }
        frame = await __classPrivateFieldGet$4(this, _Page_frameTree, "f").waitForFrame(frameId);
        this.emit(index.FrameManagerEmittedEvents.FrameNavigated, frame);
    }
}, _Page_onFrameDetached = function _Page_onFrameDetached(info) {
    const frame = this.frame(info.context);
    if (frame) {
        __classPrivateFieldGet$4(this, _Page_instances, "m", _Page_removeFramesRecursively).call(this, frame);
    }
}, _Page_removeFramesRecursively = function _Page_removeFramesRecursively(frame) {
    for (const child of frame.childFrames()) {
        __classPrivateFieldGet$4(this, _Page_instances, "m", _Page_removeFramesRecursively).call(this, child);
    }
    frame.dispose();
    __classPrivateFieldGet$4(this, _Page_frameTree, "f").removeFrame(frame);
    this.emit(index.FrameManagerEmittedEvents.FrameDetached, frame);
}, _Page_onLogEntryAdded = function _Page_onLogEntryAdded(event) {
    if (!this.frame(event.source.context)) {
        return;
    }
    if (isConsoleLogEntry(event)) {
        const args = event.args.map(arg => {
            return getBidiHandle(this.mainFrame().context(), arg);
        });
        const text = args
            .reduce((value, arg) => {
            const parsedValue = arg.isPrimitiveValue
                ? BidiSerializer.deserialize(arg.remoteValue())
                : arg.toString();
            return `${value} ${parsedValue}`;
        }, '')
            .slice(1);
        this.emit("console" /* PageEmittedEvents.Console */, new index.ConsoleMessage(event.method, text, args, getStackTraceLocations(event.stackTrace)));
    }
    else if (isJavaScriptLogEntry(event)) {
        let message = event.text ?? '';
        if (event.stackTrace) {
            for (const callFrame of event.stackTrace.callFrames) {
                const location = callFrame.url +
                    ':' +
                    callFrame.lineNumber +
                    ':' +
                    callFrame.columnNumber;
                const functionName = callFrame.functionName || '<anonymous>';
                message += `\n    at ${functionName} (${location})`;
            }
        }
        const error = new Error(message);
        error.stack = ''; // Don't capture Puppeteer stacktrace.
        this.emit("pageerror" /* PageEmittedEvents.PageError */, error);
    }
    else {
        index.debugError(`Unhandled LogEntry with type "${event.type}", text "${event.text}" and level "${event.level}"`);
    }
};
function isConsoleLogEntry(event) {
    return event.type === 'console';
}
function isJavaScriptLogEntry(event) {
    return event.type === 'javascript';
}
function getStackTraceLocations(stackTrace) {
    const stackTraceLocations = [];
    if (stackTrace) {
        for (const callFrame of stackTrace.callFrames) {
            stackTraceLocations.push({
                url: callFrame.url,
                lineNumber: callFrame.lineNumber,
                columnNumber: callFrame.columnNumber,
            });
        }
    }
    return stackTraceLocations;
}

/**
 * Copyright 2022 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
var __classPrivateFieldSet$3 = (undefined && undefined.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var __classPrivateFieldGet$3 = (undefined && undefined.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _BrowserContext_instances, _BrowserContext_connection, _BrowserContext_defaultViewport, _BrowserContext_pages, _BrowserContext_onContextDestroyedBind, _BrowserContext_onContextDestroyed;
/**
 * @internal
 */
class BrowserContext extends index.BrowserContext {
    constructor(connection, options) {
        super();
        _BrowserContext_instances.add(this);
        _BrowserContext_connection.set(this, void 0);
        _BrowserContext_defaultViewport.set(this, void 0);
        _BrowserContext_pages.set(this, new Map());
        _BrowserContext_onContextDestroyedBind.set(this, __classPrivateFieldGet$3(this, _BrowserContext_instances, "m", _BrowserContext_onContextDestroyed).bind(this));
        __classPrivateFieldSet$3(this, _BrowserContext_connection, connection, "f");
        __classPrivateFieldSet$3(this, _BrowserContext_defaultViewport, options.defaultViewport, "f");
        __classPrivateFieldGet$3(this, _BrowserContext_connection, "f").on('browsingContext.contextDestroyed', __classPrivateFieldGet$3(this, _BrowserContext_onContextDestroyedBind, "f"));
    }
    async newPage() {
        const { result } = await __classPrivateFieldGet$3(this, _BrowserContext_connection, "f").send('browsingContext.create', {
            type: 'tab',
        });
        const page = new Page(__classPrivateFieldGet$3(this, _BrowserContext_connection, "f"), result);
        if (__classPrivateFieldGet$3(this, _BrowserContext_defaultViewport, "f")) {
            try {
                await page.setViewport(__classPrivateFieldGet$3(this, _BrowserContext_defaultViewport, "f"));
            }
            catch {
                // No support for setViewport in Firefox.
            }
        }
        __classPrivateFieldGet$3(this, _BrowserContext_pages, "f").set(result.context, page);
        return page;
    }
    async close() {
        for (const page of __classPrivateFieldGet$3(this, _BrowserContext_pages, "f").values()) {
            await page?.close().catch(error => {
                debugError(error);
            });
        }
        __classPrivateFieldGet$3(this, _BrowserContext_pages, "f").clear();
    }
}
_BrowserContext_connection = new WeakMap(), _BrowserContext_defaultViewport = new WeakMap(), _BrowserContext_pages = new WeakMap(), _BrowserContext_onContextDestroyedBind = new WeakMap(), _BrowserContext_instances = new WeakSet(), _BrowserContext_onContextDestroyed = async function _BrowserContext_onContextDestroyed(event) {
    const page = __classPrivateFieldGet$3(this, _BrowserContext_pages, "f").get(event.context);
    await page?.close().catch(error => {
        debugError(error);
    });
    __classPrivateFieldGet$3(this, _BrowserContext_pages, "f").delete(event.context);
};

/**
 * Copyright 2022 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
var __classPrivateFieldSet$2 = (undefined && undefined.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var __classPrivateFieldGet$2 = (undefined && undefined.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _Browser_process, _Browser_closeCallback, _Browser_connection, _Browser_defaultViewport;
/**
 * @internal
 */
class Browser extends index.Browser {
    static async create(opts) {
        // TODO: await until the connection is established.
        try {
            await opts.connection.send('session.new', {});
        }
        catch { }
        await opts.connection.send('session.subscribe', {
            events: Browser.subscribeModules,
        });
        return new Browser(opts);
    }
    constructor(opts) {
        super();
        _Browser_process.set(this, void 0);
        _Browser_closeCallback.set(this, void 0);
        _Browser_connection.set(this, void 0);
        _Browser_defaultViewport.set(this, void 0);
        __classPrivateFieldSet$2(this, _Browser_process, opts.process, "f");
        __classPrivateFieldSet$2(this, _Browser_closeCallback, opts.closeCallback, "f");
        __classPrivateFieldSet$2(this, _Browser_connection, opts.connection, "f");
        __classPrivateFieldSet$2(this, _Browser_defaultViewport, opts.defaultViewport, "f");
    }
    async close() {
        __classPrivateFieldGet$2(this, _Browser_connection, "f").dispose();
        await __classPrivateFieldGet$2(this, _Browser_closeCallback, "f")?.call(null);
    }
    isConnected() {
        return !__classPrivateFieldGet$2(this, _Browser_connection, "f").closed;
    }
    process() {
        return __classPrivateFieldGet$2(this, _Browser_process, "f") ?? null;
    }
    async createIncognitoBrowserContext(_options) {
        return new BrowserContext(__classPrivateFieldGet$2(this, _Browser_connection, "f"), {
            defaultViewport: __classPrivateFieldGet$2(this, _Browser_defaultViewport, "f"),
        });
    }
}
_Browser_process = new WeakMap(), _Browser_closeCallback = new WeakMap(), _Browser_connection = new WeakMap(), _Browser_defaultViewport = new WeakMap();
Browser.subscribeModules = ['browsingContext', 'network', 'log'];

/**
 * Copyright 2017 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
var __classPrivateFieldSet$1 = (undefined && undefined.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var __classPrivateFieldGet$1 = (undefined && undefined.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _Connection_instances, _Connection_transport, _Connection_delay, _Connection_timeout, _Connection_closed, _Connection_callbacks, _Connection_browsingContexts, _Connection_maybeEmitOnContext, _Connection_onClose;
const debugProtocolSend = index.debug('puppeteer:webDriverBiDi:SEND ►');
const debugProtocolReceive = index.debug('puppeteer:webDriverBiDi:RECV ◀');
/**
 * @internal
 */
class Connection extends index.EventEmitter {
    constructor(transport, delay = 0, timeout) {
        super();
        _Connection_instances.add(this);
        _Connection_transport.set(this, void 0);
        _Connection_delay.set(this, void 0);
        _Connection_timeout.set(this, 0);
        _Connection_closed.set(this, false);
        _Connection_callbacks.set(this, new index.CallbackRegistry());
        _Connection_browsingContexts.set(this, new Map());
        __classPrivateFieldSet$1(this, _Connection_delay, delay, "f");
        __classPrivateFieldSet$1(this, _Connection_timeout, timeout ?? 180000, "f");
        __classPrivateFieldSet$1(this, _Connection_transport, transport, "f");
        __classPrivateFieldGet$1(this, _Connection_transport, "f").onmessage = this.onMessage.bind(this);
        __classPrivateFieldGet$1(this, _Connection_transport, "f").onclose = __classPrivateFieldGet$1(this, _Connection_instances, "m", _Connection_onClose).bind(this);
    }
    get closed() {
        return __classPrivateFieldGet$1(this, _Connection_closed, "f");
    }
    send(method, params) {
        return __classPrivateFieldGet$1(this, _Connection_callbacks, "f").create(method, __classPrivateFieldGet$1(this, _Connection_timeout, "f"), id => {
            const stringifiedMessage = JSON.stringify({
                id,
                method,
                params,
            });
            debugProtocolSend(stringifiedMessage);
            __classPrivateFieldGet$1(this, _Connection_transport, "f").send(stringifiedMessage);
        });
    }
    /**
     * @internal
     */
    async onMessage(message) {
        if (__classPrivateFieldGet$1(this, _Connection_delay, "f")) {
            await new Promise(f => {
                return setTimeout(f, __classPrivateFieldGet$1(this, _Connection_delay, "f"));
            });
        }
        debugProtocolReceive(message);
        const object = JSON.parse(message);
        if ('id' in object) {
            if ('error' in object) {
                __classPrivateFieldGet$1(this, _Connection_callbacks, "f").reject(object.id, createProtocolError(object), object.message);
            }
            else {
                __classPrivateFieldGet$1(this, _Connection_callbacks, "f").resolve(object.id, object);
            }
        }
        else {
            __classPrivateFieldGet$1(this, _Connection_instances, "m", _Connection_maybeEmitOnContext).call(this, object);
            this.emit(object.method, object.params);
        }
    }
    registerBrowsingContexts(context) {
        __classPrivateFieldGet$1(this, _Connection_browsingContexts, "f").set(context.id, context);
    }
    unregisterBrowsingContexts(id) {
        __classPrivateFieldGet$1(this, _Connection_browsingContexts, "f").delete(id);
    }
    dispose() {
        __classPrivateFieldGet$1(this, _Connection_instances, "m", _Connection_onClose).call(this);
        __classPrivateFieldGet$1(this, _Connection_transport, "f").close();
    }
}
_Connection_transport = new WeakMap(), _Connection_delay = new WeakMap(), _Connection_timeout = new WeakMap(), _Connection_closed = new WeakMap(), _Connection_callbacks = new WeakMap(), _Connection_browsingContexts = new WeakMap(), _Connection_instances = new WeakSet(), _Connection_maybeEmitOnContext = function _Connection_maybeEmitOnContext(event) {
    let context;
    // Context specific events
    if ('context' in event.params && event.params.context) {
        context = __classPrivateFieldGet$1(this, _Connection_browsingContexts, "f").get(event.params.context);
        // `log.entryAdded` specific context
    }
    else if ('source' in event.params && event.params.source.context) {
        context = __classPrivateFieldGet$1(this, _Connection_browsingContexts, "f").get(event.params.source.context);
    }
    context?.emit(event.method, event.params);
}, _Connection_onClose = function _Connection_onClose() {
    if (__classPrivateFieldGet$1(this, _Connection_closed, "f")) {
        return;
    }
    __classPrivateFieldSet$1(this, _Connection_closed, true, "f");
    __classPrivateFieldGet$1(this, _Connection_transport, "f").onmessage = undefined;
    __classPrivateFieldGet$1(this, _Connection_transport, "f").onclose = undefined;
    __classPrivateFieldGet$1(this, _Connection_callbacks, "f").clear();
};
/**
 * @internal
 */
function createProtocolError(object) {
    let message = `${object.error} ${object.message}`;
    if (object.stacktrace) {
        message += ` ${object.stacktrace}`;
    }
    return message;
}

/**
 * Copyright 2023 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
var __classPrivateFieldSet = (undefined && undefined.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var __classPrivateFieldGet = (undefined && undefined.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _CDPConnectionAdapter_cdp, _CDPConnectionAdapter_adapters, _CDPConnectionAdapter_browser, _CDPClientAdapter_closed, _CDPClientAdapter_client, _CDPClientAdapter_forwardMessage, _NoOpTransport_onMessage;
/**
 * @internal
 */
async function connectBidiOverCDP(cdp) {
    const transportBiDi = new NoOpTransport();
    const cdpConnectionAdapter = new CDPConnectionAdapter(cdp);
    const pptrTransport = {
        send(message) {
            // Forwards a BiDi command sent by Puppeteer to the input of the BidiServer.
            transportBiDi.emitMessage(JSON.parse(message));
        },
        close() {
            bidiServer.close();
            cdpConnectionAdapter.close();
        },
        onmessage(_message) {
            // The method is overridden by the Connection.
        },
    };
    transportBiDi.on('bidiResponse', (message) => {
        // Forwards a BiDi event sent by BidiServer to Puppeteer.
        pptrTransport.onmessage(JSON.stringify(message));
    });
    const pptrBiDiConnection = new Connection(pptrTransport);
    const bidiServer = await chromiumBidi_bidiMapper.bidiMapper.BidiServer.createAndStart(transportBiDi, cdpConnectionAdapter, '');
    return pptrBiDiConnection;
}
/**
 * Manages CDPSessions for BidiServer.
 * @internal
 */
class CDPConnectionAdapter {
    constructor(cdp) {
        _CDPConnectionAdapter_cdp.set(this, void 0);
        _CDPConnectionAdapter_adapters.set(this, new Map());
        _CDPConnectionAdapter_browser.set(this, void 0);
        __classPrivateFieldSet(this, _CDPConnectionAdapter_cdp, cdp, "f");
        __classPrivateFieldSet(this, _CDPConnectionAdapter_browser, new CDPClientAdapter(cdp), "f");
    }
    browserClient() {
        return __classPrivateFieldGet(this, _CDPConnectionAdapter_browser, "f");
    }
    getCdpClient(id) {
        const session = __classPrivateFieldGet(this, _CDPConnectionAdapter_cdp, "f").session(id);
        if (!session) {
            throw new Error('Unknown CDP session with id' + id);
        }
        if (!__classPrivateFieldGet(this, _CDPConnectionAdapter_adapters, "f").has(session)) {
            const adapter = new CDPClientAdapter(session);
            __classPrivateFieldGet(this, _CDPConnectionAdapter_adapters, "f").set(session, adapter);
            return adapter;
        }
        return __classPrivateFieldGet(this, _CDPConnectionAdapter_adapters, "f").get(session);
    }
    close() {
        __classPrivateFieldGet(this, _CDPConnectionAdapter_browser, "f").close();
        for (const adapter of __classPrivateFieldGet(this, _CDPConnectionAdapter_adapters, "f").values()) {
            adapter.close();
        }
    }
}
_CDPConnectionAdapter_cdp = new WeakMap(), _CDPConnectionAdapter_adapters = new WeakMap(), _CDPConnectionAdapter_browser = new WeakMap();
/**
 * Wrapper on top of CDPSession/CDPConnection to satisfy CDP interface that
 * BidiServer needs.
 *
 * @internal
 */
class CDPClientAdapter extends chromiumBidi_bidiMapper.bidiMapper.EventEmitter {
    constructor(client) {
        super();
        _CDPClientAdapter_closed.set(this, false);
        _CDPClientAdapter_client.set(this, void 0);
        _CDPClientAdapter_forwardMessage.set(this, (method, event) => {
            this.emit(method, event);
        });
        __classPrivateFieldSet(this, _CDPClientAdapter_client, client, "f");
        __classPrivateFieldGet(this, _CDPClientAdapter_client, "f").on('*', __classPrivateFieldGet(this, _CDPClientAdapter_forwardMessage, "f"));
    }
    async sendCommand(method, ...params) {
        if (__classPrivateFieldGet(this, _CDPClientAdapter_closed, "f")) {
            return;
        }
        try {
            return await __classPrivateFieldGet(this, _CDPClientAdapter_client, "f").send(method, ...params);
        }
        catch (err) {
            if (__classPrivateFieldGet(this, _CDPClientAdapter_closed, "f")) {
                return;
            }
            throw err;
        }
    }
    close() {
        __classPrivateFieldGet(this, _CDPClientAdapter_client, "f").off('*', __classPrivateFieldGet(this, _CDPClientAdapter_forwardMessage, "f"));
        __classPrivateFieldSet(this, _CDPClientAdapter_closed, true, "f");
    }
    isCloseError(error) {
        return error instanceof index.TargetCloseError;
    }
}
_CDPClientAdapter_closed = new WeakMap(), _CDPClientAdapter_client = new WeakMap(), _CDPClientAdapter_forwardMessage = new WeakMap();
/**
 * This transport is given to the BiDi server instance and allows Puppeteer
 * to send and receive commands to the BiDiServer.
 * @internal
 */
class NoOpTransport extends chromiumBidi_bidiMapper.bidiMapper.EventEmitter {
    constructor() {
        super(...arguments);
        _NoOpTransport_onMessage.set(this, async (_m) => {
            return;
        });
    }
    emitMessage(message) {
        void __classPrivateFieldGet(this, _NoOpTransport_onMessage, "f").call(this, message);
    }
    setOnMessage(onMessage) {
        __classPrivateFieldSet(this, _NoOpTransport_onMessage, onMessage, "f");
    }
    async sendMessage(message) {
        this.emit('bidiResponse', message);
    }
    close() {
        __classPrivateFieldSet(this, _NoOpTransport_onMessage, async (_m) => {
            return;
        }, "f");
    }
}
_NoOpTransport_onMessage = new WeakMap();

exports.Browser = Browser;
exports.BrowserContext = BrowserContext;
exports.Connection = Connection;
exports.Page = Page;
exports.connectBidiOverCDP = connectBidiOverCDP;
