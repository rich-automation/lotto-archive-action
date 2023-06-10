'use strict';

var index = require('./index.js');
require('os');
require('fs');
require('path');
require('http');
require('https');
require('net');
require('tls');
require('events');
require('assert');
require('util');
require('stream');
require('url');
require('punycode');
require('zlib');
require('buffer');
require('crypto');
require('child_process');
require('fs/promises');
require('tty');
require('constants');
require('string_decoder');
require('readline');
require('process');
require('module');

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
            case '+Infinity':
                return Infinity;
            case '-Infinity':
                return -Infinity;
            default:
                return value;
        }
    }
    static deserializeLocalValue(result) {
        var _a;
        switch (result.type) {
            case 'array':
                // TODO: Check expected output when value is undefined
                return (_a = result.value) === null || _a === void 0 ? void 0 : _a.map(value => {
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
        target: { context: client._contextId },
        handles: [remoteReference.handle],
    })
        .catch((error) => {
        // Exceptions might happen in case of a page been navigated or closed.
        // Swallow these since they are harmless and we don't leak anything in this case.
        debugError(error);
    });
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
var _JSHandle_disposed, _JSHandle_context, _JSHandle_remoteValue;
class JSHandle extends index.JSHandle {
    constructor(context, remoteValue) {
        super();
        _JSHandle_disposed.set(this, false);
        _JSHandle_context.set(this, void 0);
        _JSHandle_remoteValue.set(this, void 0);
        __classPrivateFieldSet$6(this, _JSHandle_context, context, "f");
        __classPrivateFieldSet$6(this, _JSHandle_remoteValue, remoteValue, "f");
    }
    context() {
        return __classPrivateFieldGet$6(this, _JSHandle_context, "f");
    }
    get connection() {
        return __classPrivateFieldGet$6(this, _JSHandle_context, "f").connection;
    }
    get disposed() {
        return __classPrivateFieldGet$6(this, _JSHandle_disposed, "f");
    }
    async evaluate(pageFunction, ...args) {
        return await this.context().evaluate(pageFunction, this, ...args);
    }
    async evaluateHandle(pageFunction, ...args) {
        return await this.context().evaluateHandle(pageFunction, this, ...args);
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
        const value = BidiSerializer.deserialize(__classPrivateFieldGet$6(this, _JSHandle_remoteValue, "f"));
        if (__classPrivateFieldGet$6(this, _JSHandle_remoteValue, "f").type !== 'undefined' && value === undefined) {
            throw new Error('Could not serialize referenced object');
        }
        return value;
    }
    asElement() {
        return null;
    }
    async dispose() {
        if (__classPrivateFieldGet$6(this, _JSHandle_disposed, "f")) {
            return;
        }
        __classPrivateFieldSet$6(this, _JSHandle_disposed, true, "f");
        if ('handle' in __classPrivateFieldGet$6(this, _JSHandle_remoteValue, "f")) {
            await releaseReference(__classPrivateFieldGet$6(this, _JSHandle_context, "f"), __classPrivateFieldGet$6(this, _JSHandle_remoteValue, "f"));
        }
    }
    get isPrimitiveValue() {
        switch (__classPrivateFieldGet$6(this, _JSHandle_remoteValue, "f").type) {
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
            return 'JSHandle:' + BidiSerializer.deserialize(__classPrivateFieldGet$6(this, _JSHandle_remoteValue, "f"));
        }
        return 'JSHandle@' + __classPrivateFieldGet$6(this, _JSHandle_remoteValue, "f").type;
    }
    get id() {
        return 'handle' in __classPrivateFieldGet$6(this, _JSHandle_remoteValue, "f") ? __classPrivateFieldGet$6(this, _JSHandle_remoteValue, "f").handle : undefined;
    }
    remoteValue() {
        return __classPrivateFieldGet$6(this, _JSHandle_remoteValue, "f");
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
    get connection() {
        return this.handle.connection;
    }
    get isPrimitiveValue() {
        return this.handle.isPrimitiveValue;
    }
    remoteValue() {
        return this.handle.remoteValue();
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
var _Context_instances, _Context_connection, _Context_url, _Context_evaluate;
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
const lifeCycleToSubscribedEvent = new Map([
    ['load', 'browsingContext.load'],
    ['domcontentloaded', 'browsingContext.domContentLoaded'],
]);
/**
 * @internal
 */
class Context extends index.EventEmitter {
    constructor(connection, result) {
        super();
        _Context_instances.add(this);
        _Context_connection.set(this, void 0);
        _Context_url.set(this, void 0);
        this._timeoutSettings = new index.TimeoutSettings();
        __classPrivateFieldSet$5(this, _Context_connection, connection, "f");
        this._contextId = result.context;
        __classPrivateFieldSet$5(this, _Context_url, result.url, "f");
    }
    get connection() {
        return __classPrivateFieldGet$5(this, _Context_connection, "f");
    }
    get id() {
        return this._contextId;
    }
    async evaluateHandle(pageFunction, ...args) {
        return __classPrivateFieldGet$5(this, _Context_instances, "m", _Context_evaluate).call(this, false, pageFunction, ...args);
    }
    async evaluate(pageFunction, ...args) {
        return __classPrivateFieldGet$5(this, _Context_instances, "m", _Context_evaluate).call(this, true, pageFunction, ...args);
    }
    async goto(url, options = {}) {
        const { waitUntil = 'load', timeout = this._timeoutSettings.navigationTimeout(), } = options;
        const readinessState = lifeCycleToReadinessState.get(getWaitUntilSingle(waitUntil));
        try {
            const response = await index.waitWithTimeout(this.connection.send('browsingContext.navigate', {
                url: url,
                context: this.id,
                wait: readinessState,
            }), 'Navigation', timeout);
            __classPrivateFieldSet$5(this, _Context_url, response.result.url, "f");
            return null;
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
    url() {
        return __classPrivateFieldGet$5(this, _Context_url, "f");
    }
    async setContent(html, options = {}) {
        const { waitUntil = 'load', timeout = this._timeoutSettings.navigationTimeout(), } = options;
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
}
_Context_connection = new WeakMap(), _Context_url = new WeakMap(), _Context_instances = new WeakSet(), _Context_evaluate = async function _Context_evaluate(returnByValue, pageFunction, ...args) {
    let responsePromise;
    const resultOwnership = returnByValue ? 'none' : 'root';
    if (index.isString(pageFunction)) {
        responsePromise = __classPrivateFieldGet$5(this, _Context_connection, "f").send('script.evaluate', {
            expression: pageFunction,
            target: { context: this._contextId },
            resultOwnership,
            awaitPromise: true,
        });
    }
    else {
        responsePromise = __classPrivateFieldGet$5(this, _Context_connection, "f").send('script.callFunction', {
            functionDeclaration: index.stringifyFunction(pageFunction),
            arguments: await Promise.all(args.map(arg => {
                return BidiSerializer.serialize(arg, this);
            })),
            target: { context: this._contextId },
            resultOwnership,
            awaitPromise: true,
        });
    }
    const { result } = await responsePromise;
    if ('type' in result && result.type === 'exception') {
        throw new Error(result.exceptionDetails.text);
    }
    return returnByValue
        ? BidiSerializer.deserialize(result.result)
        : getBidiHandle(this, result.result);
};
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
 * @internal
 */
function getBidiHandle(context, result) {
    if (result.type === 'node' || result.type === 'window') {
        return new ElementHandle(context, result);
    }
    return new JSHandle(context, result);
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
var _Page_instances, _Page_context, _Page_subscribedEvents, _Page_onLogEntryAdded, _Page_onLoad, _Page_onDOMLoad;
/**
 * @internal
 */
class Page extends index.Page {
    constructor(context) {
        super();
        _Page_instances.add(this);
        _Page_context.set(this, void 0);
        _Page_subscribedEvents.set(this, new Map([
            ['log.entryAdded', __classPrivateFieldGet$4(this, _Page_instances, "m", _Page_onLogEntryAdded).bind(this)],
            ['browsingContext.load', __classPrivateFieldGet$4(this, _Page_instances, "m", _Page_onLoad).bind(this)],
            ['browsingContext.domContentLoaded', __classPrivateFieldGet$4(this, _Page_instances, "m", _Page_onDOMLoad).bind(this)],
        ]));
        __classPrivateFieldSet$4(this, _Page_context, context, "f");
        __classPrivateFieldGet$4(this, _Page_context, "f").connection
            .send('session.subscribe', {
            events: [
                ...__classPrivateFieldGet$4(this, _Page_subscribedEvents, "f").keys(),
            ],
            contexts: [__classPrivateFieldGet$4(this, _Page_context, "f").id],
        })
            .catch(error => {
            if (index.isErrorLike(error) && !error.message.includes('Target closed')) {
                throw error;
            }
        });
        for (const [event, subscriber] of __classPrivateFieldGet$4(this, _Page_subscribedEvents, "f")) {
            __classPrivateFieldGet$4(this, _Page_context, "f").on(event, subscriber);
        }
    }
    async close() {
        await __classPrivateFieldGet$4(this, _Page_context, "f").connection.send('session.unsubscribe', {
            events: [...__classPrivateFieldGet$4(this, _Page_subscribedEvents, "f").keys()],
            contexts: [__classPrivateFieldGet$4(this, _Page_context, "f").id],
        });
        await __classPrivateFieldGet$4(this, _Page_context, "f").connection.send('browsingContext.close', {
            context: __classPrivateFieldGet$4(this, _Page_context, "f").id,
        });
        for (const [event, subscriber] of __classPrivateFieldGet$4(this, _Page_subscribedEvents, "f")) {
            __classPrivateFieldGet$4(this, _Page_context, "f").off(event, subscriber);
        }
    }
    async evaluateHandle(pageFunction, ...args) {
        return __classPrivateFieldGet$4(this, _Page_context, "f").evaluateHandle(pageFunction, ...args);
    }
    async evaluate(pageFunction, ...args) {
        return __classPrivateFieldGet$4(this, _Page_context, "f").evaluate(pageFunction, ...args);
    }
    async goto(url, options) {
        return __classPrivateFieldGet$4(this, _Page_context, "f").goto(url, options);
    }
    url() {
        return __classPrivateFieldGet$4(this, _Page_context, "f").url();
    }
    setDefaultNavigationTimeout(timeout) {
        __classPrivateFieldGet$4(this, _Page_context, "f")._timeoutSettings.setDefaultNavigationTimeout(timeout);
    }
    setDefaultTimeout(timeout) {
        __classPrivateFieldGet$4(this, _Page_context, "f")._timeoutSettings.setDefaultTimeout(timeout);
    }
    async setContent(html, options = {}) {
        await __classPrivateFieldGet$4(this, _Page_context, "f").setContent(html, options);
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
    async pdf(options = {}) {
        const { path = undefined } = options;
        const { printBackground: background, margin, landscape, width, height, pageRanges, scale, preferCSSPageSize, timeout, } = this._getPDFOptions(options, 'cm');
        const { result } = await index.waitWithTimeout(__classPrivateFieldGet$4(this, _Page_context, "f").connection.send('browsingContext.print', {
            context: __classPrivateFieldGet$4(this, _Page_context, "f")._contextId,
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
        const { result } = await __classPrivateFieldGet$4(this, _Page_context, "f").connection.send('browsingContext.captureScreenshot', {
            context: __classPrivateFieldGet$4(this, _Page_context, "f")._contextId,
        });
        if (encoding === 'base64') {
            return result.data;
        }
        const buffer = Buffer.from(result.data, 'base64');
        await this._maybeWriteBufferToFile(path, buffer);
        return buffer;
    }
}
_Page_context = new WeakMap(), _Page_subscribedEvents = new WeakMap(), _Page_instances = new WeakSet(), _Page_onLogEntryAdded = function _Page_onLogEntryAdded(event) {
    var _a;
    if (isConsoleLogEntry(event)) {
        const args = event.args.map(arg => {
            return getBidiHandle(__classPrivateFieldGet$4(this, _Page_context, "f"), arg);
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
        let message = (_a = event.text) !== null && _a !== void 0 ? _a : '';
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
}, _Page_onLoad = function _Page_onLoad(_event) {
    this.emit("load" /* PageEmittedEvents.Load */);
}, _Page_onDOMLoad = function _Page_onDOMLoad(_event) {
    this.emit("domcontentloaded" /* PageEmittedEvents.DOMContentLoaded */);
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
var _BrowserContext_connection;
/**
 * @internal
 */
class BrowserContext extends index.BrowserContext {
    constructor(connection) {
        super();
        _BrowserContext_connection.set(this, void 0);
        __classPrivateFieldSet$3(this, _BrowserContext_connection, connection, "f");
    }
    async newPage() {
        const { result } = await __classPrivateFieldGet$3(this, _BrowserContext_connection, "f").send('browsingContext.create', {
            type: 'tab',
        });
        const context = __classPrivateFieldGet$3(this, _BrowserContext_connection, "f").context(result.context);
        return new Page(context);
    }
    async close() { }
}
_BrowserContext_connection = new WeakMap();

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
var _Browser_process, _Browser_closeCallback, _Browser_connection;
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
            events: [
                'browsingContext.contextCreated',
            ],
        });
        return new Browser(opts);
    }
    constructor(opts) {
        super();
        _Browser_process.set(this, void 0);
        _Browser_closeCallback.set(this, void 0);
        _Browser_connection.set(this, void 0);
        __classPrivateFieldSet$2(this, _Browser_process, opts.process, "f");
        __classPrivateFieldSet$2(this, _Browser_closeCallback, opts.closeCallback, "f");
        __classPrivateFieldSet$2(this, _Browser_connection, opts.connection, "f");
    }
    async close() {
        var _a;
        __classPrivateFieldGet$2(this, _Browser_connection, "f").dispose();
        await ((_a = __classPrivateFieldGet$2(this, _Browser_closeCallback, "f")) === null || _a === void 0 ? void 0 : _a.call(null));
    }
    isConnected() {
        return !__classPrivateFieldGet$2(this, _Browser_connection, "f").closed;
    }
    process() {
        var _a;
        return (_a = __classPrivateFieldGet$2(this, _Browser_process, "f")) !== null && _a !== void 0 ? _a : null;
    }
    async createIncognitoBrowserContext(_options) {
        return new BrowserContext(__classPrivateFieldGet$2(this, _Browser_connection, "f"));
    }
}
_Browser_process = new WeakMap(), _Browser_closeCallback = new WeakMap(), _Browser_connection = new WeakMap();

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
var _Connection_instances, _Connection_transport, _Connection_delay, _Connection_timeout, _Connection_closed, _Connection_callbacks, _Connection_contexts, _Connection_maybeEmitOnContext, _Connection_handleSpecialEvents, _Connection_onClose;
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
        _Connection_contexts.set(this, new Map());
        __classPrivateFieldSet$1(this, _Connection_delay, delay, "f");
        __classPrivateFieldSet$1(this, _Connection_timeout, timeout !== null && timeout !== void 0 ? timeout : 180000, "f");
        __classPrivateFieldSet$1(this, _Connection_transport, transport, "f");
        __classPrivateFieldGet$1(this, _Connection_transport, "f").onmessage = this.onMessage.bind(this);
        __classPrivateFieldGet$1(this, _Connection_transport, "f").onclose = __classPrivateFieldGet$1(this, _Connection_instances, "m", _Connection_onClose).bind(this);
    }
    get closed() {
        return __classPrivateFieldGet$1(this, _Connection_closed, "f");
    }
    context(contextId) {
        return __classPrivateFieldGet$1(this, _Connection_contexts, "f").get(contextId) || null;
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
            __classPrivateFieldGet$1(this, _Connection_instances, "m", _Connection_handleSpecialEvents).call(this, object);
            __classPrivateFieldGet$1(this, _Connection_instances, "m", _Connection_maybeEmitOnContext).call(this, object);
            this.emit(object.method, object.params);
        }
    }
    dispose() {
        __classPrivateFieldGet$1(this, _Connection_instances, "m", _Connection_onClose).call(this);
        __classPrivateFieldGet$1(this, _Connection_transport, "f").close();
    }
}
_Connection_transport = new WeakMap(), _Connection_delay = new WeakMap(), _Connection_timeout = new WeakMap(), _Connection_closed = new WeakMap(), _Connection_callbacks = new WeakMap(), _Connection_contexts = new WeakMap(), _Connection_instances = new WeakSet(), _Connection_maybeEmitOnContext = function _Connection_maybeEmitOnContext(event) {
    let context;
    // Context specific events
    if ('context' in event.params && event.params.context) {
        context = __classPrivateFieldGet$1(this, _Connection_contexts, "f").get(event.params.context);
        // `log.entryAdded` specific context
    }
    else if ('source' in event.params && event.params.source.context) {
        context = __classPrivateFieldGet$1(this, _Connection_contexts, "f").get(event.params.source.context);
    }
    context === null || context === void 0 ? void 0 : context.emit(event.method, event.params);
}, _Connection_handleSpecialEvents = function _Connection_handleSpecialEvents(event) {
    switch (event.method) {
        case 'browsingContext.contextCreated':
            __classPrivateFieldGet$1(this, _Connection_contexts, "f").set(event.params.context, new Context(this, event.params));
    }
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

var bidiMapper = {};

var BidiServer$1 = {};

var EventEmitter$1 = {};

var mitt=function(n){return {all:n=n||new Map,on:function(e,t){var i=n.get(e);i?i.push(t):n.set(e,[t]);},off:function(e,t){var i=n.get(e);i&&(t?i.splice(i.indexOf(t)>>>0,1):n.set(e,[]));},emit:function(e,t){var i=n.get(e);i&&i.slice().map(function(n){n(t);}),(i=n.get("*"))&&i.slice().map(function(n){n(e,t);});}}};

var __importDefault = (index.commonjsGlobal && index.commonjsGlobal.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(EventEmitter$1, "__esModule", { value: true });
EventEmitter$1.EventEmitter = void 0;
/**
 * Copyright 2022 Google LLC.
 * Copyright (c) Microsoft Corporation.
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
const mitt_1 = __importDefault(mitt);
class EventEmitter {
    #emitter = (0, mitt_1.default)();
    on(type, handler) {
        this.#emitter.on(type, handler);
        return this;
    }
    /**
     * Like `on` but the listener will only be fired once and then it will be removed.
     * @param event The event you'd like to listen to
     * @param handler The handler function to run when the event occurs
     * @return `this` to enable chaining method calls.
     */
    once(event, handler) {
        const onceHandler = (eventData) => {
            handler(eventData);
            this.off(event, onceHandler);
        };
        return this.on(event, onceHandler);
    }
    off(type, handler) {
        this.#emitter.off(type, handler);
        return this;
    }
    /**
     * Emits an event and call any associated listeners.
     *
     * @param event The event to emit.
     * @param eventData Any data to emit with the event.
     * @return `true` if there are any listeners, `false` otherwise.
     */
    emit(event, eventData) {
        this.#emitter.emit(event, eventData);
    }
}
EventEmitter$1.EventEmitter = EventEmitter;

var processingQueue = {};

var log = {};

(function (exports) {
	/**
	 * Copyright 2021 Google LLC.
	 * Copyright (c) Microsoft Corporation.
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
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.LogType = void 0;
	(function (LogType) {
	    // keep-sorted start
	    LogType["bidi"] = "BiDi Messages";
	    LogType["browsingContexts"] = "Browsing Contexts";
	    LogType["cdp"] = "CDP";
	    LogType["system"] = "System";
	    // keep-sorted end
	})(exports.LogType || (exports.LogType = {}));
	
} (log));

/**
 * Copyright 2022 Google LLC.
 * Copyright (c) Microsoft Corporation.
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
Object.defineProperty(processingQueue, "__esModule", { value: true });
processingQueue.ProcessingQueue = void 0;
const log_js_1$3 = log;
class ProcessingQueue {
    #catch;
    #logger;
    #processor;
    #queue = [];
    // Flag to keep only 1 active processor.
    #isProcessing = false;
    constructor(processor, _catch = () => Promise.resolve(), logger) {
        this.#catch = _catch;
        this.#processor = processor;
        this.#logger = logger;
    }
    add(entry) {
        this.#queue.push(entry);
        // No need in waiting. Just initialise processor if needed.
        void this.#processIfNeeded();
    }
    async #processIfNeeded() {
        if (this.#isProcessing) {
            return;
        }
        this.#isProcessing = true;
        while (this.#queue.length > 0) {
            const entryPromise = this.#queue.shift();
            if (entryPromise !== undefined) {
                await entryPromise
                    .then((entry) => this.#processor(entry))
                    .catch((e) => {
                    this.#logger?.(log_js_1$3.LogType.system, 'Event was not processed:', e);
                    this.#catch(e);
                });
            }
        }
        this.#isProcessing = false;
    }
}
processingQueue.ProcessingQueue = ProcessingQueue;

var CommandProcessor$1 = {};

var protocol = {};

(function (exports) {
	/**
	 * Copyright 2022 Google LLC.
	 * Copyright (c) Microsoft Corporation.
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
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.CDP = exports.Network = exports.Log = exports.BrowsingContext = exports.Script = exports.Message = void 0;
	(function (Message) {
	    // keep-sorted end;
	    let ErrorCode;
	    (function (ErrorCode) {
	        // keep-sorted start
	        ErrorCode["InvalidArgument"] = "invalid argument";
	        ErrorCode["InvalidSessionId"] = "invalid session id";
	        ErrorCode["NoSuchAlert"] = "no such alert";
	        ErrorCode["NoSuchFrame"] = "no such frame";
	        ErrorCode["NoSuchHandle"] = "no such handle";
	        ErrorCode["NoSuchNode"] = "no such node";
	        ErrorCode["NoSuchScript"] = "no such script";
	        ErrorCode["SessionNotCreated"] = "session not created";
	        ErrorCode["UnknownCommand"] = "unknown command";
	        ErrorCode["UnknownError"] = "unknown error";
	        ErrorCode["UnsupportedOperation"] = "unsupported operation";
	        // keep-sorted end
	    })(ErrorCode = Message.ErrorCode || (Message.ErrorCode = {}));
	    class ErrorResponse {
	        error;
	        message;
	        stacktrace;
	        constructor(error, message, stacktrace) {
	            this.error = error;
	            this.message = message;
	            this.stacktrace = stacktrace;
	        }
	        toErrorResponse(commandId) {
	            return {
	                id: commandId,
	                error: this.error,
	                message: this.message,
	                stacktrace: this.stacktrace,
	            };
	        }
	    }
	    Message.ErrorResponse = ErrorResponse;
	    class InvalidArgumentException extends ErrorResponse {
	        constructor(message, stacktrace) {
	            super(ErrorCode.InvalidArgument, message, stacktrace);
	        }
	    }
	    Message.InvalidArgumentException = InvalidArgumentException;
	    class NoSuchHandleException extends ErrorResponse {
	        constructor(message, stacktrace) {
	            super(ErrorCode.NoSuchHandle, message, stacktrace);
	        }
	    }
	    Message.NoSuchHandleException = NoSuchHandleException;
	    class InvalidSessionIdException extends ErrorResponse {
	        constructor(message, stacktrace) {
	            super(ErrorCode.InvalidSessionId, message, stacktrace);
	        }
	    }
	    Message.InvalidSessionIdException = InvalidSessionIdException;
	    class NoSuchAlertException extends ErrorResponse {
	        constructor(message, stacktrace) {
	            super(ErrorCode.NoSuchAlert, message, stacktrace);
	        }
	    }
	    Message.NoSuchAlertException = NoSuchAlertException;
	    class NoSuchFrameException extends ErrorResponse {
	        constructor(message) {
	            super(ErrorCode.NoSuchFrame, message);
	        }
	    }
	    Message.NoSuchFrameException = NoSuchFrameException;
	    class NoSuchNodeException extends ErrorResponse {
	        constructor(message, stacktrace) {
	            super(ErrorCode.NoSuchNode, message, stacktrace);
	        }
	    }
	    Message.NoSuchNodeException = NoSuchNodeException;
	    class NoSuchScriptException extends ErrorResponse {
	        constructor(message, stacktrace) {
	            super(ErrorCode.NoSuchScript, message, stacktrace);
	        }
	    }
	    Message.NoSuchScriptException = NoSuchScriptException;
	    class SessionNotCreatedException extends ErrorResponse {
	        constructor(message, stacktrace) {
	            super(ErrorCode.SessionNotCreated, message, stacktrace);
	        }
	    }
	    Message.SessionNotCreatedException = SessionNotCreatedException;
	    class UnknownCommandException extends ErrorResponse {
	        constructor(message, stacktrace) {
	            super(ErrorCode.UnknownCommand, message, stacktrace);
	        }
	    }
	    Message.UnknownCommandException = UnknownCommandException;
	    class UnknownErrorException extends ErrorResponse {
	        constructor(message, stacktrace) {
	            super(ErrorCode.UnknownError, message, stacktrace);
	        }
	    }
	    Message.UnknownErrorException = UnknownErrorException;
	    class UnsupportedOperationException extends ErrorResponse {
	        constructor(message, stacktrace) {
	            super(ErrorCode.UnsupportedOperation, message, stacktrace);
	        }
	    }
	    Message.UnsupportedOperationException = UnsupportedOperationException;
	})(exports.Message || (exports.Message = {}));
	(function (Script) {
	    (function (EventNames) {
	        EventNames["MessageEvent"] = "script.message";
	    })(Script.EventNames || (Script.EventNames = {}));
	    Script.AllEvents = 'script';
	})(exports.Script || (exports.Script = {}));
	(function (BrowsingContext) {
	    (function (EventNames) {
	        EventNames["LoadEvent"] = "browsingContext.load";
	        EventNames["DomContentLoadedEvent"] = "browsingContext.domContentLoaded";
	        EventNames["ContextCreatedEvent"] = "browsingContext.contextCreated";
	        EventNames["ContextDestroyedEvent"] = "browsingContext.contextDestroyed";
	    })(BrowsingContext.EventNames || (BrowsingContext.EventNames = {}));
	    BrowsingContext.AllEvents = 'browsingContext';
	})(exports.BrowsingContext || (exports.BrowsingContext = {}));
	(function (Log) {
	    Log.AllEvents = 'log';
	    (function (EventNames) {
	        EventNames["LogEntryAddedEvent"] = "log.entryAdded";
	    })(Log.EventNames || (Log.EventNames = {}));
	})(exports.Log || (exports.Log = {}));
	(function (Network) {
	    Network.AllEvents = 'network';
	    (function (EventNames) {
	        EventNames["BeforeRequestSentEvent"] = "network.beforeRequestSent";
	        EventNames["ResponseCompletedEvent"] = "network.responseCompleted";
	        EventNames["FetchErrorEvent"] = "network.fetchError";
	    })(Network.EventNames || (Network.EventNames = {}));
	})(exports.Network || (exports.Network = {}));
	(function (CDP) {
	    CDP.AllEvents = 'cdp';
	    (function (EventNames) {
	        EventNames["EventReceivedEvent"] = "cdp.eventReceived";
	    })(CDP.EventNames || (CDP.EventNames = {}));
	})(exports.CDP || (exports.CDP = {}));
	
} (protocol));

var browsingContextProcessor = {};

var browsingContextImpl = {};

var unitConversions = {};

/**
 * Copyright 2023 Google LLC.
 * Copyright (c) Microsoft Corporation.
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
Object.defineProperty(unitConversions, "__esModule", { value: true });
unitConversions.inchesFromCm = void 0;
/** @return Given an input in cm, convert it to inches. */
function inchesFromCm(cm) {
    return cm / 2.54;
}
unitConversions.inchesFromCm = inchesFromCm;

var deferred = {};

/**
 * Copyright 2022 Google LLC.
 * Copyright (c) Microsoft Corporation.
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
Object.defineProperty(deferred, "__esModule", { value: true });
deferred.Deferred = void 0;
class Deferred {
    #isFinished = false;
    #promise;
    #resolve = () => { };
    #reject = () => { };
    get isFinished() {
        return this.#isFinished;
    }
    constructor() {
        this.#promise = new Promise((resolve, reject) => {
            this.#resolve = resolve;
            this.#reject = reject;
        });
        // Needed to avoid `Uncaught (in promise)`. The promises returned by `then`
        // and `catch` will be rejected anyway.
        this.#promise.catch(() => { });
    }
    then(onFulfilled, onRejected) {
        return this.#promise.then(onFulfilled, onRejected);
    }
    catch(onRejected) {
        return this.#promise.catch(onRejected);
    }
    resolve(value) {
        this.#isFinished = true;
        this.#resolve(value);
    }
    reject(reason) {
        this.#isFinished = true;
        this.#reject(reason);
    }
    finally(onFinally) {
        return this.#promise.finally(onFinally);
    }
    [Symbol.toStringTag] = 'Promise';
}
deferred.Deferred = Deferred;

var realm = {};

var scriptEvaluator = {};

(function (exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.ScriptEvaluator = exports.SHARED_ID_DIVIDER = void 0;
	const protocol_js_1 = protocol;
	// As `script.evaluate` wraps call into serialization script, `lineNumber`
	// should be adjusted.
	const CALL_FUNCTION_STACKTRACE_LINE_OFFSET = 1;
	const EVALUATE_STACKTRACE_LINE_OFFSET = 0;
	exports.SHARED_ID_DIVIDER = '_element_';
	class ScriptEvaluator {
	    #eventManager;
	    constructor(eventManager) {
	        this.#eventManager = eventManager;
	    }
	    /**
	     * Gets the string representation of an object. This is equivalent to
	     * calling toString() on the object value.
	     * @param cdpObject CDP remote object representing an object.
	     * @param realm
	     * @return string The stringified object.
	     */
	    static async stringifyObject(cdpObject, realm) {
	        const stringifyResult = await realm.cdpClient.sendCommand('Runtime.callFunctionOn', {
	            functionDeclaration: String((obj) => {
	                return String(obj);
	            }),
	            awaitPromise: false,
	            arguments: [cdpObject],
	            returnByValue: true,
	            executionContextId: realm.executionContextId,
	        });
	        return stringifyResult.result.value;
	    }
	    /**
	     * Serializes a given CDP object into BiDi, keeping references in the
	     * target's `globalThis`.
	     * @param cdpRemoteObject CDP remote object to be serialized.
	     * @param resultOwnership Indicates desired ResultOwnership.
	     * @param realm
	     */
	    async serializeCdpObject(cdpRemoteObject, resultOwnership, realm) {
	        const arg = ScriptEvaluator.#cdpRemoteObjectToCallArgument(cdpRemoteObject);
	        const cdpWebDriverValue = await realm.cdpClient.sendCommand('Runtime.callFunctionOn', {
	            functionDeclaration: String((obj) => obj),
	            awaitPromise: false,
	            arguments: [arg],
	            generateWebDriverValue: true,
	            executionContextId: realm.executionContextId,
	        });
	        return realm.cdpToBidiValue(cdpWebDriverValue, resultOwnership);
	    }
	    async scriptEvaluate(realm, expression, awaitPromise, resultOwnership) {
	        const cdpEvaluateResult = await realm.cdpClient.sendCommand('Runtime.evaluate', {
	            contextId: realm.executionContextId,
	            expression,
	            awaitPromise,
	            generateWebDriverValue: true,
	        });
	        if (cdpEvaluateResult.exceptionDetails) {
	            // Serialize exception details.
	            return {
	                exceptionDetails: await this.#serializeCdpExceptionDetails(cdpEvaluateResult.exceptionDetails, EVALUATE_STACKTRACE_LINE_OFFSET, resultOwnership, realm),
	                type: 'exception',
	                realm: realm.realmId,
	            };
	        }
	        return {
	            type: 'success',
	            result: realm.cdpToBidiValue(cdpEvaluateResult, resultOwnership),
	            realm: realm.realmId,
	        };
	    }
	    async callFunction(realm, functionDeclaration, _this, _arguments, awaitPromise, resultOwnership) {
	        const callFunctionAndSerializeScript = `(...args)=>{ return _callFunction((\n${functionDeclaration}\n), args);
      function _callFunction(f, args) {
        const deserializedThis = args.shift();
        const deserializedArgs = args;
        return f.apply(deserializedThis, deserializedArgs);
      }}`;
	        const thisAndArgumentsList = [
	            await this.#deserializeToCdpArg(_this, realm),
	        ];
	        thisAndArgumentsList.push(...(await Promise.all(_arguments.map(async (a) => {
	            return this.#deserializeToCdpArg(a, realm);
	        }))));
	        let cdpCallFunctionResult;
	        try {
	            cdpCallFunctionResult = await realm.cdpClient.sendCommand('Runtime.callFunctionOn', {
	                functionDeclaration: callFunctionAndSerializeScript,
	                awaitPromise,
	                arguments: thisAndArgumentsList,
	                generateWebDriverValue: true,
	                executionContextId: realm.executionContextId,
	            });
	        }
	        catch (e) {
	            // Heuristic to determine if the problem is in the argument.
	            // The check can be done on the `deserialization` step, but this approach
	            // helps to save round-trips.
	            if (e.code === -32000 &&
	                [
	                    'Could not find object with given id',
	                    'Argument should belong to the same JavaScript world as target object',
	                    'Invalid remote object id',
	                ].includes(e.message)) {
	                throw new protocol_js_1.Message.NoSuchHandleException('Handle was not found.');
	            }
	            throw e;
	        }
	        if (cdpCallFunctionResult.exceptionDetails) {
	            // Serialize exception details.
	            return {
	                exceptionDetails: await this.#serializeCdpExceptionDetails(cdpCallFunctionResult.exceptionDetails, CALL_FUNCTION_STACKTRACE_LINE_OFFSET, resultOwnership, realm),
	                type: 'exception',
	                realm: realm.realmId,
	            };
	        }
	        return {
	            type: 'success',
	            result: realm.cdpToBidiValue(cdpCallFunctionResult, resultOwnership),
	            realm: realm.realmId,
	        };
	    }
	    static #cdpRemoteObjectToCallArgument(cdpRemoteObject) {
	        if (cdpRemoteObject.objectId !== undefined) {
	            return { objectId: cdpRemoteObject.objectId };
	        }
	        if (cdpRemoteObject.unserializableValue !== undefined) {
	            return { unserializableValue: cdpRemoteObject.unserializableValue };
	        }
	        return { value: cdpRemoteObject.value };
	    }
	    async #deserializeToCdpArg(argumentValue, realm) {
	        if ('sharedId' in argumentValue) {
	            const [navigableId, rawBackendNodeId] = argumentValue.sharedId.split(exports.SHARED_ID_DIVIDER);
	            const backendNodeId = parseInt(rawBackendNodeId ?? '');
	            if (isNaN(backendNodeId) ||
	                backendNodeId === undefined ||
	                navigableId === undefined) {
	                throw new protocol_js_1.Message.InvalidArgumentException(`SharedId "${argumentValue.sharedId}" should have format "{navigableId}${exports.SHARED_ID_DIVIDER}{backendNodeId}".`);
	            }
	            if (realm.navigableId !== navigableId) {
	                throw new protocol_js_1.Message.NoSuchNodeException(`SharedId "${argumentValue.sharedId}" belongs to different document. Current document is ${realm.navigableId}.`);
	            }
	            try {
	                const obj = await realm.cdpClient.sendCommand('DOM.resolveNode', {
	                    backendNodeId,
	                    executionContextId: realm.executionContextId,
	                });
	                // TODO(#375): Release `obj.object.objectId` after using.
	                return { objectId: obj.object.objectId };
	            }
	            catch (e) {
	                // Heuristic to detect "no such node" exception. Based on the  specific
	                // CDP implementation.
	                if (e.code === -32000 && e.message === 'No node with given id found') {
	                    throw new protocol_js_1.Message.NoSuchNodeException(`SharedId "${argumentValue.sharedId}" was not found.`);
	                }
	                throw e;
	            }
	        }
	        if ('handle' in argumentValue) {
	            return { objectId: argumentValue.handle };
	        }
	        switch (argumentValue.type) {
	            // Primitive Protocol Value
	            // https://w3c.github.io/webdriver-bidi/#data-types-protocolValue-primitiveProtocolValue
	            case 'undefined':
	                return { unserializableValue: 'undefined' };
	            case 'null':
	                return { unserializableValue: 'null' };
	            case 'string':
	                return { value: argumentValue.value };
	            case 'number':
	                if (argumentValue.value === 'NaN') {
	                    return { unserializableValue: 'NaN' };
	                }
	                else if (argumentValue.value === '-0') {
	                    return { unserializableValue: '-0' };
	                }
	                else if (argumentValue.value === 'Infinity') {
	                    return { unserializableValue: 'Infinity' };
	                }
	                else if (argumentValue.value === '-Infinity') {
	                    return { unserializableValue: '-Infinity' };
	                }
	                return {
	                    value: argumentValue.value,
	                };
	            case 'boolean':
	                return { value: Boolean(argumentValue.value) };
	            case 'bigint':
	                return {
	                    unserializableValue: `BigInt(${JSON.stringify(argumentValue.value)})`,
	                };
	            case 'date':
	                return {
	                    unserializableValue: `new Date(Date.parse(${JSON.stringify(argumentValue.value)}))`,
	                };
	            case 'regexp':
	                return {
	                    unserializableValue: `new RegExp(${JSON.stringify(argumentValue.value.pattern)}, ${JSON.stringify(argumentValue.value.flags)})`,
	                };
	            case 'map': {
	                // TODO(sadym): If none of the nested keys and values has a remote
	                // reference, serialize to `unserializableValue` without CDP roundtrip.
	                const keyValueArray = await this.#flattenKeyValuePairs(argumentValue.value, realm);
	                const argEvalResult = await realm.cdpClient.sendCommand('Runtime.callFunctionOn', {
	                    functionDeclaration: String((...args) => {
	                        const result = new Map();
	                        for (let i = 0; i < args.length; i += 2) {
	                            result.set(args[i], args[i + 1]);
	                        }
	                        return result;
	                    }),
	                    awaitPromise: false,
	                    arguments: keyValueArray,
	                    returnByValue: false,
	                    executionContextId: realm.executionContextId,
	                });
	                // TODO(#375): Release `argEvalResult.result.objectId` after using.
	                return { objectId: argEvalResult.result.objectId };
	            }
	            case 'object': {
	                // TODO(sadym): If none of the nested keys and values has a remote
	                //  reference, serialize to `unserializableValue` without CDP roundtrip.
	                const keyValueArray = await this.#flattenKeyValuePairs(argumentValue.value, realm);
	                const argEvalResult = await realm.cdpClient.sendCommand('Runtime.callFunctionOn', {
	                    functionDeclaration: String((...args) => {
	                        const result = {};
	                        for (let i = 0; i < args.length; i += 2) {
	                            // Key should be either `string`, `number`, or `symbol`.
	                            const key = args[i];
	                            result[key] = args[i + 1];
	                        }
	                        return result;
	                    }),
	                    awaitPromise: false,
	                    arguments: keyValueArray,
	                    returnByValue: false,
	                    executionContextId: realm.executionContextId,
	                });
	                // TODO(#375): Release `argEvalResult.result.objectId` after using.
	                return { objectId: argEvalResult.result.objectId };
	            }
	            case 'array': {
	                // TODO(sadym): If none of the nested items has a remote reference,
	                // serialize to `unserializableValue` without CDP roundtrip.
	                const args = await this.#flattenValueList(argumentValue.value, realm);
	                const argEvalResult = await realm.cdpClient.sendCommand('Runtime.callFunctionOn', {
	                    functionDeclaration: String((...args) => {
	                        return args;
	                    }),
	                    awaitPromise: false,
	                    arguments: args,
	                    returnByValue: false,
	                    executionContextId: realm.executionContextId,
	                });
	                // TODO(#375): Release `argEvalResult.result.objectId` after using.
	                return { objectId: argEvalResult.result.objectId };
	            }
	            case 'set': {
	                // TODO(sadym): if none of the nested items has a remote reference,
	                // serialize to `unserializableValue` without CDP roundtrip.
	                const args = await this.#flattenValueList(argumentValue.value, realm);
	                const argEvalResult = await realm.cdpClient.sendCommand('Runtime.callFunctionOn', {
	                    functionDeclaration: String((...args) => {
	                        return new Set(args);
	                    }),
	                    awaitPromise: false,
	                    arguments: args,
	                    returnByValue: false,
	                    executionContextId: realm.executionContextId,
	                });
	                // TODO(#375): Release `argEvalResult.result.objectId` after using.
	                return { objectId: argEvalResult.result.objectId };
	            }
	            case 'channel': {
	                const createChannelHandleResult = await realm.cdpClient.sendCommand('Runtime.callFunctionOn', {
	                    functionDeclaration: String(() => {
	                        const queue = [];
	                        let queueNonEmptyResolver = null;
	                        return {
	                            /**
	                             * Gets a promise, which is resolved as soon as a message occurs
	                             * in the queue.
	                             */
	                            async getMessage() {
	                                const onMessage = queue.length > 0
	                                    ? Promise.resolve()
	                                    : new Promise((resolve) => {
	                                        queueNonEmptyResolver = resolve;
	                                    });
	                                await onMessage;
	                                return queue.shift();
	                            },
	                            /**
	                             * Adds a message to the queue.
	                             * Resolves the pending promise if needed.
	                             */
	                            sendMessage(message) {
	                                queue.push(message);
	                                if (queueNonEmptyResolver !== null) {
	                                    queueNonEmptyResolver();
	                                    queueNonEmptyResolver = null;
	                                }
	                            },
	                        };
	                    }),
	                    returnByValue: false,
	                    executionContextId: realm.executionContextId,
	                    generateWebDriverValue: false,
	                });
	                const channelHandle = createChannelHandleResult.result.objectId;
	                // Long-poll the message queue asynchronously.
	                void this.#initChannelListener(argumentValue, channelHandle, realm);
	                const sendMessageArgResult = await realm.cdpClient.sendCommand('Runtime.callFunctionOn', {
	                    functionDeclaration: String((channelHandle) => {
	                        return channelHandle.sendMessage;
	                    }),
	                    arguments: [
	                        {
	                            objectId: channelHandle,
	                        },
	                    ],
	                    returnByValue: false,
	                    executionContextId: realm.executionContextId,
	                    generateWebDriverValue: false,
	                });
	                return { objectId: sendMessageArgResult.result.objectId };
	            }
	            // TODO(#375): Dispose of nested objects.
	            default:
	                throw new Error(`Value ${JSON.stringify(argumentValue)} is not deserializable.`);
	        }
	    }
	    async #flattenKeyValuePairs(mapping, realm) {
	        const keyValueArray = [];
	        for (const [key, value] of mapping) {
	            let keyArg;
	            if (typeof key === 'string') {
	                // Key is a string.
	                keyArg = { value: key };
	            }
	            else {
	                // Key is a serialized value.
	                keyArg = await this.#deserializeToCdpArg(key, realm);
	            }
	            const valueArg = await this.#deserializeToCdpArg(value, realm);
	            keyValueArray.push(keyArg);
	            keyValueArray.push(valueArg);
	        }
	        return keyValueArray;
	    }
	    async #flattenValueList(list, realm) {
	        return Promise.all(list.map((value) => this.#deserializeToCdpArg(value, realm)));
	    }
	    async #initChannelListener(channel, channelHandle, realm) {
	        const channelId = channel.value.channel;
	        // TODO(#294): Remove this loop after the realm is destroyed.
	        // Rely on the CDP throwing exception in such a case.
	        for (;;) {
	            const message = await realm.cdpClient.sendCommand('Runtime.callFunctionOn', {
	                functionDeclaration: String(async (channelHandle) => channelHandle.getMessage()),
	                arguments: [
	                    {
	                        objectId: channelHandle,
	                    },
	                ],
	                awaitPromise: true,
	                executionContextId: realm.executionContextId,
	                generateWebDriverValue: true,
	            });
	            this.#eventManager.registerEvent({
	                method: protocol_js_1.Script.EventNames.MessageEvent,
	                params: {
	                    channel: channelId,
	                    data: realm.cdpToBidiValue(message, channel.value.ownership ?? 'none'),
	                    source: {
	                        realm: realm.realmId,
	                        context: realm.browsingContextId,
	                    },
	                },
	            }, realm.browsingContextId);
	        }
	    }
	    async #serializeCdpExceptionDetails(cdpExceptionDetails, lineOffset, resultOwnership, realm) {
	        const callFrames = cdpExceptionDetails.stackTrace?.callFrames.map((frame) => ({
	            url: frame.url,
	            functionName: frame.functionName,
	            // As `script.evaluate` wraps call into serialization script, so
	            // `lineNumber` should be adjusted.
	            lineNumber: frame.lineNumber - lineOffset,
	            columnNumber: frame.columnNumber,
	        }));
	        const exception = await this.serializeCdpObject(
	        // Exception should always be there.
	        cdpExceptionDetails.exception, resultOwnership, realm);
	        const text = await ScriptEvaluator.stringifyObject(cdpExceptionDetails.exception, realm);
	        return {
	            exception,
	            columnNumber: cdpExceptionDetails.columnNumber,
	            // As `script.evaluate` wraps call into serialization script, so
	            // `lineNumber` should be adjusted.
	            lineNumber: cdpExceptionDetails.lineNumber - lineOffset,
	            stackTrace: {
	                callFrames: callFrames || [],
	            },
	            text: text || cdpExceptionDetails.text,
	        };
	    }
	}
	exports.ScriptEvaluator = ScriptEvaluator;
	
} (scriptEvaluator));

/**
 * Copyright 2022 Google LLC.
 * Copyright (c) Microsoft Corporation.
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
Object.defineProperty(realm, "__esModule", { value: true });
realm.Realm = void 0;
const scriptEvaluator_js_1 = scriptEvaluator;
class Realm {
    #realmStorage;
    #browsingContextStorage;
    #realmId;
    #browsingContextId;
    #executionContextId;
    #origin;
    #type;
    #cdpClient;
    #eventManager;
    #scriptEvaluator;
    sandbox;
    cdpSessionId;
    constructor(realmStorage, browsingContextStorage, realmId, browsingContextId, executionContextId, origin, type, sandbox, cdpSessionId, cdpClient, eventManager) {
        this.#realmId = realmId;
        this.#browsingContextId = browsingContextId;
        this.#executionContextId = executionContextId;
        this.sandbox = sandbox;
        this.#origin = origin;
        this.#type = type;
        this.cdpSessionId = cdpSessionId;
        this.#cdpClient = cdpClient;
        this.#realmStorage = realmStorage;
        this.#browsingContextStorage = browsingContextStorage;
        this.#eventManager = eventManager;
        this.#scriptEvaluator = new scriptEvaluator_js_1.ScriptEvaluator(this.#eventManager);
        this.#realmStorage.realmMap.set(this.#realmId, this);
    }
    async disown(handle) {
        // Disowning an object from different realm does nothing.
        if (this.#realmStorage.knownHandlesToRealm.get(handle) !== this.realmId) {
            return;
        }
        try {
            await this.cdpClient.sendCommand('Runtime.releaseObject', {
                objectId: handle,
            });
        }
        catch (e) {
            // Heuristic to determine if the problem is in the unknown handler.
            // Ignore the error if so.
            if (!(e.code === -32000 && e.message === 'Invalid remote object id')) {
                throw e;
            }
        }
        this.#realmStorage.knownHandlesToRealm.delete(handle);
    }
    cdpToBidiValue(cdpValue, resultOwnership) {
        const cdpWebDriverValue = cdpValue.result.webDriverValue;
        const bidiValue = this.webDriverValueToBiDi(cdpWebDriverValue);
        if (cdpValue.result.objectId) {
            const objectId = cdpValue.result.objectId;
            if (resultOwnership === 'root') {
                // Extend BiDi value with `handle` based on required `resultOwnership`
                // and  CDP response but not on the actual BiDi type.
                bidiValue.handle = objectId;
                // Remember all the handles sent to client.
                this.#realmStorage.knownHandlesToRealm.set(objectId, this.realmId);
            }
            else {
                // No need in awaiting for the object to be released.
                void this.cdpClient.sendCommand('Runtime.releaseObject', { objectId });
            }
        }
        return bidiValue;
    }
    webDriverValueToBiDi(webDriverValue) {
        // This relies on the CDP to implement proper BiDi serialization, except
        // backendNodeId/sharedId and `platformobject`.
        const result = webDriverValue;
        // Platform object is a special case. It should have only `{type: object}`
        // without `value` field.
        if (result.type === 'platformobject') {
            return { type: 'object' };
        }
        const bidiValue = result.value;
        if (bidiValue === undefined) {
            return result;
        }
        if (result.type === 'node') {
            if (Object.hasOwn(bidiValue, 'backendNodeId')) {
                // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                bidiValue.sharedId = `${this.navigableId}${scriptEvaluator_js_1.SHARED_ID_DIVIDER}${bidiValue.backendNodeId}`;
                delete bidiValue['backendNodeId'];
            }
            if (Object.hasOwn(bidiValue, 'children')) {
                for (const i in bidiValue.children) {
                    bidiValue.children[i] = this.webDriverValueToBiDi(bidiValue.children[i]);
                }
            }
        }
        // Recursively update the nested values.
        if (['array', 'set'].includes(webDriverValue.type)) {
            for (const i in bidiValue) {
                bidiValue[i] = this.webDriverValueToBiDi(bidiValue[i]);
            }
        }
        if (['object', 'map'].includes(webDriverValue.type)) {
            for (const i in bidiValue) {
                bidiValue[i] = [
                    this.webDriverValueToBiDi(bidiValue[i][0]),
                    this.webDriverValueToBiDi(bidiValue[i][1]),
                ];
            }
        }
        return result;
    }
    toBiDi() {
        return {
            realm: this.realmId,
            origin: this.origin,
            type: this.type,
            context: this.browsingContextId,
            ...(this.sandbox === undefined ? {} : { sandbox: this.sandbox }),
        };
    }
    get realmId() {
        return this.#realmId;
    }
    get navigableId() {
        return (this.#browsingContextStorage.findContext(this.#browsingContextId)
            ?.navigableId ?? 'UNKNOWN');
    }
    get browsingContextId() {
        return this.#browsingContextId;
    }
    get executionContextId() {
        return this.#executionContextId;
    }
    get origin() {
        return this.#origin;
    }
    get type() {
        return this.#type;
    }
    get cdpClient() {
        return this.#cdpClient;
    }
    async callFunction(functionDeclaration, _this, _arguments, awaitPromise, resultOwnership) {
        const context = this.#browsingContextStorage.getContext(this.browsingContextId);
        await context.awaitUnblocked();
        return {
            result: await this.#scriptEvaluator.callFunction(this, functionDeclaration, _this, _arguments, awaitPromise, resultOwnership),
        };
    }
    async scriptEvaluate(expression, awaitPromise, resultOwnership) {
        const context = this.#browsingContextStorage.getContext(this.browsingContextId);
        await context.awaitUnblocked();
        return {
            result: await this.#scriptEvaluator.scriptEvaluate(this, expression, awaitPromise, resultOwnership),
        };
    }
    /**
     * Serializes a given CDP object into BiDi, keeping references in the
     * target's `globalThis`.
     * @param cdpObject CDP remote object to be serialized.
     * @param resultOwnership Indicates desired ResultOwnership.
     */
    async serializeCdpObject(cdpObject, resultOwnership) {
        return this.#scriptEvaluator.serializeCdpObject(cdpObject, resultOwnership, this);
    }
    /**
     * Gets the string representation of an object. This is equivalent to
     * calling toString() on the object value.
     * @param cdpObject CDP remote object representing an object.
     * @return string The stringified object.
     */
    async stringifyObject(cdpObject) {
        return scriptEvaluator_js_1.ScriptEvaluator.stringifyObject(cdpObject, this);
    }
}
realm.Realm = Realm;

/**
 * Copyright 2022 Google LLC.
 * Copyright (c) Microsoft Corporation.
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
Object.defineProperty(browsingContextImpl, "__esModule", { value: true });
browsingContextImpl.BrowsingContextImpl = void 0;
const unitConversions_js_1 = unitConversions;
const protocol_js_1$7 = protocol;
const log_js_1$2 = log;
const deferred_js_1 = deferred;
const realm_js_1 = realm;
class BrowsingContextImpl {
    /** The ID of the current context. */
    #contextId;
    /**
     * The ID of the parent context.
     * If null, this is a top-level context.
     */
    #parentId;
    /**
     * Children contexts.
     * Map from children context ID to context implementation.
     */
    #children = new Map();
    #browsingContextStorage;
    #defers = {
        documentInitialized: new deferred_js_1.Deferred(),
        Page: {
            navigatedWithinDocument: new deferred_js_1.Deferred(),
            lifecycleEvent: {
                DOMContentLoaded: new deferred_js_1.Deferred(),
                load: new deferred_js_1.Deferred(),
            },
        },
    };
    #url = 'about:blank';
    #eventManager;
    #realmStorage;
    #loaderId = null;
    #cdpTarget;
    #maybeDefaultRealm;
    #logger;
    constructor(cdpTarget, realmStorage, contextId, parentId, eventManager, browsingContextStorage, logger) {
        this.#cdpTarget = cdpTarget;
        this.#realmStorage = realmStorage;
        this.#contextId = contextId;
        this.#parentId = parentId;
        this.#eventManager = eventManager;
        this.#browsingContextStorage = browsingContextStorage;
        this.#logger = logger;
        this.#initListeners();
    }
    static create(cdpTarget, realmStorage, contextId, parentId, eventManager, browsingContextStorage, logger) {
        const context = new BrowsingContextImpl(cdpTarget, realmStorage, contextId, parentId, eventManager, browsingContextStorage, logger);
        browsingContextStorage.addContext(context);
        eventManager.registerEvent({
            method: protocol_js_1$7.BrowsingContext.EventNames.ContextCreatedEvent,
            params: context.serializeToBidiValue(),
        }, context.contextId);
        return context;
    }
    /**
     * @see https://html.spec.whatwg.org/multipage/document-sequences.html#navigable
     */
    get navigableId() {
        return this.#loaderId;
    }
    delete() {
        this.#deleteChildren();
        this.#realmStorage.deleteRealms({
            browsingContextId: this.contextId,
        });
        // Remove context from the parent.
        if (this.parentId !== null) {
            const parent = this.#browsingContextStorage.getContext(this.parentId);
            parent.#children.delete(this.contextId);
        }
        this.#eventManager.registerEvent({
            method: protocol_js_1$7.BrowsingContext.EventNames.ContextDestroyedEvent,
            params: this.serializeToBidiValue(),
        }, this.contextId);
        this.#browsingContextStorage.deleteContext(this.contextId);
    }
    /** Returns the ID of this context. */
    get contextId() {
        return this.#contextId;
    }
    /** Returns the parent context ID. */
    get parentId() {
        return this.#parentId;
    }
    /** Returns all children contexts. */
    get children() {
        return Array.from(this.#children.values());
    }
    /**
     * Returns true if this is a top-level context.
     * This is the case whenever the parent context ID is null.
     */
    isTopLevelContext() {
        return this.#parentId === null;
    }
    addChild(child) {
        this.#children.set(child.contextId, child);
    }
    #deleteChildren() {
        this.children.map((child) => child.delete());
    }
    get #defaultRealm() {
        if (this.#maybeDefaultRealm === undefined) {
            throw new Error(`No default realm for browsing context ${this.#contextId}`);
        }
        return this.#maybeDefaultRealm;
    }
    get cdpTarget() {
        return this.#cdpTarget;
    }
    updateCdpTarget(cdpTarget) {
        this.#cdpTarget = cdpTarget;
        this.#initListeners();
    }
    get url() {
        return this.#url;
    }
    async awaitLoaded() {
        await this.#defers.Page.lifecycleEvent.load;
    }
    awaitUnblocked() {
        return this.#cdpTarget.targetUnblocked;
    }
    async getOrCreateSandbox(sandbox) {
        if (sandbox === undefined || sandbox === '') {
            return this.#defaultRealm;
        }
        let maybeSandboxes = this.#realmStorage.findRealms({
            browsingContextId: this.contextId,
            sandbox,
        });
        if (maybeSandboxes.length === 0) {
            await this.#cdpTarget.cdpClient.sendCommand('Page.createIsolatedWorld', {
                frameId: this.contextId,
                worldName: sandbox,
            });
            // `Runtime.executionContextCreated` should be emitted by the time the
            // previous command is done.
            maybeSandboxes = this.#realmStorage.findRealms({
                browsingContextId: this.contextId,
                sandbox,
            });
        }
        if (maybeSandboxes.length !== 1) {
            throw Error(`Sandbox ${sandbox} wasn't created.`);
        }
        return maybeSandboxes[0];
    }
    serializeToBidiValue(maxDepth = 0, addParentFiled = true) {
        return {
            context: this.#contextId,
            url: this.url,
            children: maxDepth > 0
                ? this.children.map((c) => c.serializeToBidiValue(maxDepth - 1, false))
                : null,
            ...(addParentFiled ? { parent: this.#parentId } : {}),
        };
    }
    #initListeners() {
        this.#cdpTarget.cdpClient.on('Target.targetInfoChanged', (params) => {
            if (this.contextId !== params.targetInfo.targetId) {
                return;
            }
            this.#url = params.targetInfo.url;
        });
        this.#cdpTarget.cdpClient.on('Page.frameNavigated', (params) => {
            if (this.contextId !== params.frame.id) {
                return;
            }
            this.#url = params.frame.url + (params.frame.urlFragment ?? '');
            // At the point the page is initiated, all the nested iframes from the
            // previous page are detached and realms are destroyed.
            // Remove context's children.
            this.#deleteChildren();
        });
        this.#cdpTarget.cdpClient.on('Page.navigatedWithinDocument', (params) => {
            if (this.contextId !== params.frameId) {
                return;
            }
            this.#url = params.url;
            this.#defers.Page.navigatedWithinDocument.resolve(params);
        });
        this.#cdpTarget.cdpClient.on('Page.lifecycleEvent', (params) => {
            if (this.contextId !== params.frameId) {
                return;
            }
            // `timestamp` from the event is MonotonicTime, not real time, so
            // the best Mapper can do is to set the timestamp to the epoch time
            // of the event arrived.
            // https://chromedevtools.github.io/devtools-protocol/tot/Network/#type-MonotonicTime
            const timestamp = new Date().getTime();
            if (params.name === 'init') {
                this.#documentChanged(params.loaderId);
                this.#defers.documentInitialized.resolve();
            }
            if (params.name === 'commit') {
                this.#loaderId = params.loaderId;
                return;
            }
            if (params.loaderId !== this.#loaderId) {
                return;
            }
            switch (params.name) {
                case 'DOMContentLoaded':
                    this.#defers.Page.lifecycleEvent.DOMContentLoaded.resolve(params);
                    this.#eventManager.registerEvent({
                        method: protocol_js_1$7.BrowsingContext.EventNames.DomContentLoadedEvent,
                        params: {
                            context: this.contextId,
                            navigation: this.#loaderId,
                            timestamp,
                            url: this.#url,
                        },
                    }, this.contextId);
                    break;
                case 'load':
                    this.#defers.Page.lifecycleEvent.load.resolve(params);
                    this.#eventManager.registerEvent({
                        method: protocol_js_1$7.BrowsingContext.EventNames.LoadEvent,
                        params: {
                            context: this.contextId,
                            navigation: this.#loaderId,
                            timestamp,
                            url: this.#url,
                        },
                    }, this.contextId);
                    break;
            }
        });
        this.#cdpTarget.cdpClient.on('Runtime.executionContextCreated', (params) => {
            if (params.context.auxData.frameId !== this.contextId) {
                return;
            }
            // Only this execution contexts are supported for now.
            if (!['default', 'isolated'].includes(params.context.auxData.type)) {
                return;
            }
            const realm = new realm_js_1.Realm(this.#realmStorage, this.#browsingContextStorage, params.context.uniqueId, this.contextId, params.context.id, this.#getOrigin(params), 
            // TODO: differentiate types.
            'window', 
            // Sandbox name for isolated world.
            params.context.auxData.type === 'isolated'
                ? params.context.name
                : undefined, this.#cdpTarget.cdpSessionId, this.#cdpTarget.cdpClient, this.#eventManager);
            if (params.context.auxData.isDefault) {
                this.#maybeDefaultRealm = realm;
            }
        });
        this.#cdpTarget.cdpClient.on('Runtime.executionContextDestroyed', (params) => {
            this.#realmStorage.deleteRealms({
                cdpSessionId: this.#cdpTarget.cdpSessionId,
                executionContextId: params.executionContextId,
            });
        });
        this.#cdpTarget.cdpClient.on('Runtime.executionContextsCleared', () => {
            this.#realmStorage.deleteRealms({
                cdpSessionId: this.#cdpTarget.cdpSessionId,
            });
        });
    }
    #getOrigin(params) {
        if (params.context.auxData.type === 'isolated') {
            // Sandbox should have the same origin as the context itself, but in CDP
            // it has an empty one.
            return this.#defaultRealm.origin;
        }
        // https://html.spec.whatwg.org/multipage/origin.html#ascii-serialisation-of-an-origin
        return ['://', ''].includes(params.context.origin)
            ? 'null'
            : params.context.origin;
    }
    #documentChanged(loaderId) {
        // Same document navigation.
        if (loaderId === undefined || this.#loaderId === loaderId) {
            if (this.#defers.Page.navigatedWithinDocument.isFinished) {
                this.#defers.Page.navigatedWithinDocument =
                    new deferred_js_1.Deferred();
            }
            return;
        }
        if (this.#defers.documentInitialized.isFinished) {
            this.#defers.documentInitialized = new deferred_js_1.Deferred();
        }
        else {
            this.#logger?.(log_js_1$2.LogType.browsingContexts, 'Document changed');
        }
        if (this.#defers.Page.lifecycleEvent.DOMContentLoaded.isFinished) {
            this.#defers.Page.lifecycleEvent.DOMContentLoaded =
                new deferred_js_1.Deferred();
        }
        else {
            this.#logger?.(log_js_1$2.LogType.browsingContexts, 'Document changed');
        }
        if (this.#defers.Page.lifecycleEvent.load.isFinished) {
            this.#defers.Page.lifecycleEvent.load =
                new deferred_js_1.Deferred();
        }
        else {
            this.#logger?.(log_js_1$2.LogType.browsingContexts, 'Document changed');
        }
        this.#loaderId = loaderId;
    }
    async navigate(url, wait) {
        await this.awaitUnblocked();
        // TODO: handle loading errors.
        const cdpNavigateResult = await this.#cdpTarget.cdpClient.sendCommand('Page.navigate', {
            url,
            frameId: this.contextId,
        });
        if (cdpNavigateResult.errorText) {
            throw new protocol_js_1$7.Message.UnknownErrorException(cdpNavigateResult.errorText);
        }
        this.#documentChanged(cdpNavigateResult.loaderId);
        // Wait for `wait` condition.
        switch (wait) {
            case 'none':
                break;
            case 'interactive':
                // No `loaderId` means same-document navigation.
                if (cdpNavigateResult.loaderId === undefined) {
                    await this.#defers.Page.navigatedWithinDocument;
                }
                else {
                    await this.#defers.Page.lifecycleEvent.DOMContentLoaded;
                }
                break;
            case 'complete':
                // No `loaderId` means same-document navigation.
                if (cdpNavigateResult.loaderId === undefined) {
                    await this.#defers.Page.navigatedWithinDocument;
                }
                else {
                    await this.#defers.Page.lifecycleEvent.load;
                }
                break;
        }
        return {
            result: {
                navigation: cdpNavigateResult.loaderId || null,
                url,
            },
        };
    }
    async captureScreenshot() {
        const [, result] = await Promise.all([
            // TODO: Either make this a proposal in the BiDi spec, or focus the
            // original tab right after the screenshot is taken.
            // The screenshot command gets blocked until we focus the active tab.
            this.#cdpTarget.cdpClient.sendCommand('Page.bringToFront'),
            this.#cdpTarget.cdpClient.sendCommand('Page.captureScreenshot', {}),
        ]);
        return {
            result: {
                data: result.data,
            },
        };
    }
    async print(params) {
        const printToPdfCdpParams = {
            printBackground: params.background,
            landscape: params.orientation === 'landscape',
            pageRanges: params.pageRanges?.join(',') ?? '',
            scale: params.scale,
            preferCSSPageSize: !params.shrinkToFit,
        };
        if (params.margin?.bottom) {
            printToPdfCdpParams.marginBottom = (0, unitConversions_js_1.inchesFromCm)(params.margin.bottom);
        }
        if (params.margin?.left) {
            printToPdfCdpParams.marginLeft = (0, unitConversions_js_1.inchesFromCm)(params.margin.left);
        }
        if (params.margin?.right) {
            printToPdfCdpParams.marginRight = (0, unitConversions_js_1.inchesFromCm)(params.margin.right);
        }
        if (params.margin?.top) {
            printToPdfCdpParams.marginTop = (0, unitConversions_js_1.inchesFromCm)(params.margin.top);
        }
        if (params.page?.height) {
            printToPdfCdpParams.paperHeight = (0, unitConversions_js_1.inchesFromCm)(params.page.height);
        }
        if (params.page?.width) {
            printToPdfCdpParams.paperWidth = (0, unitConversions_js_1.inchesFromCm)(params.page.width);
        }
        const result = await this.#cdpTarget.cdpClient.sendCommand('Page.printToPDF', printToPdfCdpParams);
        return {
            result: {
                data: result.data,
            },
        };
    }
    async addPreloadScript(params) {
        const result = await this.#cdpTarget.cdpClient.sendCommand('Page.addScriptToEvaluateOnNewDocument', {
            // The spec provides a function, and CDP expects an evaluation.
            source: `(${params.expression})();`,
            worldName: params.sandbox,
        });
        return {
            result: {
                script: result.identifier,
            },
        };
    }
}
browsingContextImpl.BrowsingContextImpl = BrowsingContextImpl;

var cdpTarget = {};

var logManager = {};

var logHelper = {};

/**
 * Copyright 2022 Google LLC.
 * Copyright (c) Microsoft Corporation.
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
Object.defineProperty(logHelper, "__esModule", { value: true });
logHelper.getRemoteValuesText = logHelper.logMessageFormatter = void 0;
const specifiers = ['%s', '%d', '%i', '%f', '%o', '%O', '%c'];
function isFormmatSpecifier(str) {
    return specifiers.some((spec) => str.includes(spec));
}
/**
 * @param args input remote values to be format printed
 * @return parsed text of the remote values in specific format
 */
function logMessageFormatter(args) {
    let output = '';
    const argFormat = args[0].value.toString();
    const argValues = args.slice(1, undefined);
    const tokens = argFormat.split(new RegExp(specifiers.map((spec) => `(${spec})`).join('|'), 'g'));
    for (const token of tokens) {
        if (token === undefined || token === '') {
            continue;
        }
        if (isFormmatSpecifier(token)) {
            const arg = argValues.shift();
            // raise an exception when less value is provided
            if (arg === undefined) {
                throw new Error(`Less value is provided: "${getRemoteValuesText(args, false)}"`);
            }
            if (token === '%s') {
                output += stringFromArg(arg);
            }
            else if (token === '%d' || token === '%i') {
                if (arg.type === 'bigint' ||
                    arg.type === 'number' ||
                    arg.type === 'string') {
                    output += parseInt(arg.value.toString(), 10);
                }
                else {
                    output += 'NaN';
                }
            }
            else if (token === '%f') {
                if (arg.type === 'bigint' ||
                    arg.type === 'number' ||
                    arg.type === 'string') {
                    output += parseFloat(arg.value.toString());
                }
                else {
                    output += 'NaN';
                }
            }
            else {
                // %o, %O, %c
                output += toJson(arg);
            }
        }
        else {
            output += token;
        }
    }
    // raise an exception when more value is provided
    if (argValues.length > 0) {
        throw new Error(`More value is provided: "${getRemoteValuesText(args, false)}"`);
    }
    return output;
}
logHelper.logMessageFormatter = logMessageFormatter;
/**
 * @param arg input remote value to be parsed
 * @return parsed text of the remote value
 *
 * input: {"type": "number", "value": 1}
 * output: 1
 *
 * input: {"type": "string", "value": "abc"}
 * output: "abc"
 *
 * input: {"type": "object",  "value": [["id", {"type": "number", "value": 1}]]}
 * output: '{"id": 1}'
 *
 * input: {"type": "object", "value": [["font-size", {"type": "string", "value": "20px"}]]}
 * output: '{"font-size": "20px"}'
 */
function toJson(arg) {
    // arg type validation
    if (arg.type !== 'array' &&
        arg.type !== 'bigint' &&
        arg.type !== 'date' &&
        arg.type !== 'number' &&
        arg.type !== 'object' &&
        arg.type !== 'string') {
        return stringFromArg(arg);
    }
    if (arg.type === 'bigint') {
        return `${arg.value.toString()}n`;
    }
    if (arg.type === 'number') {
        return arg.value.toString();
    }
    if (['date', 'string'].includes(arg.type)) {
        return JSON.stringify(arg.value);
    }
    if (arg.type === 'object') {
        return `{${arg.value
            .map((pair) => {
            return `${JSON.stringify(pair[0])}:${toJson(pair[1])}`;
        })
            .join(',')}}`;
    }
    if (arg.type === 'array') {
        return `[${arg.value?.map((val) => toJson(val)).join(',') ?? ''}]`;
    }
    throw Error(`Invalid value type: ${arg.toString()}`);
}
function stringFromArg(arg) {
    if (!Object.hasOwn(arg, 'value')) {
        return arg.type;
    }
    switch (arg.type) {
        case 'string':
        case 'number':
        case 'boolean':
        case 'bigint':
            return String(arg.value);
        case 'regexp':
            return `/${arg.value.pattern}/${arg.value.flags ?? ''}`;
        case 'date':
            return new Date(arg.value).toString();
        case 'object':
            return `Object(${arg.value?.length ?? ''})`;
        case 'array':
            return `Array(${arg.value?.length ?? ''})`;
        case 'map':
            return `Map(${arg.value.length})`;
        case 'set':
            return `Set(${arg.value.length})`;
        case 'node':
            return 'node';
        default:
            return arg.type;
    }
}
function getRemoteValuesText(args, formatText) {
    const arg = args[0];
    if (!arg) {
        return '';
    }
    // if args[0] is a format specifier, format the args as output
    if (arg.type === 'string' &&
        isFormmatSpecifier(arg.value.toString()) &&
        formatText) {
        return logMessageFormatter(args);
    }
    // if args[0] is not a format specifier, just join the args with \u0020 (unicode 'SPACE')
    return args
        .map((arg) => {
        return stringFromArg(arg);
    })
        .join('\u0020');
}
logHelper.getRemoteValuesText = getRemoteValuesText;

Object.defineProperty(logManager, "__esModule", { value: true });
logManager.LogManager = void 0;
const protocol_js_1$6 = protocol;
const logHelper_js_1 = logHelper;
/** Converts CDP StackTrace object to BiDi StackTrace object. */
function getBidiStackTrace(cdpStackTrace) {
    const stackFrames = cdpStackTrace?.callFrames.map((callFrame) => {
        return {
            columnNumber: callFrame.columnNumber,
            functionName: callFrame.functionName,
            lineNumber: callFrame.lineNumber,
            url: callFrame.url,
        };
    });
    return stackFrames ? { callFrames: stackFrames } : undefined;
}
function getLogLevel(consoleApiType) {
    if (['assert', 'error'].includes(consoleApiType)) {
        return 'error';
    }
    if (['debug', 'trace'].includes(consoleApiType)) {
        return 'debug';
    }
    if (['warn', 'warning'].includes(consoleApiType)) {
        return 'warn';
    }
    return 'info';
}
class LogManager {
    #eventManager;
    #realmStorage;
    #cdpTarget;
    constructor(cdpTarget, realmStorage, eventManager) {
        this.#cdpTarget = cdpTarget;
        this.#realmStorage = realmStorage;
        this.#eventManager = eventManager;
    }
    static create(cdpTarget, realmStorage, eventManager) {
        const logManager = new LogManager(cdpTarget, realmStorage, eventManager);
        logManager.#initialize();
        return logManager;
    }
    #initialize() {
        this.#initializeLogEntryAddedEventListener();
    }
    #initializeLogEntryAddedEventListener() {
        this.#cdpTarget.cdpClient.on('Runtime.consoleAPICalled', (params) => {
            // Try to find realm by `cdpSessionId` and `executionContextId`,
            // if provided.
            const realm = this.#realmStorage.findRealm({
                cdpSessionId: this.#cdpTarget.cdpSessionId,
                executionContextId: params.executionContextId,
            });
            const argsPromise = realm === undefined
                ? Promise.resolve(params.args)
                : // Properly serialize arguments if possible.
                    Promise.all(params.args.map((arg) => {
                        return realm.serializeCdpObject(arg, 'none');
                    }));
            this.#eventManager.registerPromiseEvent(argsPromise.then((args) => ({
                method: protocol_js_1$6.Log.EventNames.LogEntryAddedEvent,
                params: {
                    level: getLogLevel(params.type),
                    source: {
                        realm: realm?.realmId ?? 'UNKNOWN',
                        context: realm?.browsingContextId ?? 'UNKNOWN',
                    },
                    text: (0, logHelper_js_1.getRemoteValuesText)(args, true),
                    timestamp: Math.round(params.timestamp),
                    stackTrace: getBidiStackTrace(params.stackTrace),
                    type: 'console',
                    // Console method is `warn`, not `warning`.
                    method: params.type === 'warning' ? 'warn' : params.type,
                    args,
                },
            })), realm?.browsingContextId ?? 'UNKNOWN', protocol_js_1$6.Log.EventNames.LogEntryAddedEvent);
        });
        this.#cdpTarget.cdpClient.on('Runtime.exceptionThrown', (params) => {
            // Try to find realm by `cdpSessionId` and `executionContextId`,
            // if provided.
            const realm = this.#realmStorage.findRealm({
                cdpSessionId: this.#cdpTarget.cdpSessionId,
                executionContextId: params.exceptionDetails.executionContextId,
            });
            // Try all the best to get the exception text.
            const textPromise = (async () => {
                if (!params.exceptionDetails.exception) {
                    return params.exceptionDetails.text;
                }
                if (realm === undefined) {
                    return JSON.stringify(params.exceptionDetails.exception);
                }
                return realm.stringifyObject(params.exceptionDetails.exception);
            })();
            this.#eventManager.registerPromiseEvent(textPromise.then((text) => ({
                method: protocol_js_1$6.Log.EventNames.LogEntryAddedEvent,
                params: {
                    level: 'error',
                    source: {
                        realm: realm?.realmId ?? 'UNKNOWN',
                        context: realm?.browsingContextId ?? 'UNKNOWN',
                    },
                    text,
                    timestamp: Math.round(params.timestamp),
                    stackTrace: getBidiStackTrace(params.exceptionDetails.stackTrace),
                    type: 'javascript',
                },
            })), realm?.browsingContextId ?? 'UNKNOWN', protocol_js_1$6.Log.EventNames.LogEntryAddedEvent);
        });
    }
}
logManager.LogManager = LogManager;

var networkProcessor = {};

var DefaultMap$1 = {};

/**
 * Copyright 2023 Google LLC.
 * Copyright (c) Microsoft Corporation.
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
Object.defineProperty(DefaultMap$1, "__esModule", { value: true });
DefaultMap$1.DefaultMap = void 0;
/**
 * A subclass of Map whose functionality is almost the same as its parent
 * except for the fact that DefaultMap never returns undefined. It provides a
 * default value for keys that do not exist.
 */
class DefaultMap extends Map {
    /** The default value to return whenever a key is not present in the map. */
    #getDefaultValue;
    constructor(getDefaultValue, entries) {
        super(entries);
        this.#getDefaultValue = getDefaultValue;
    }
    get(key) {
        if (!this.has(key)) {
            this.set(key, this.#getDefaultValue(key));
        }
        return super.get(key);
    }
}
DefaultMap$1.DefaultMap = DefaultMap;

var networkRequest = {};

/*
 * Copyright 2023 Google LLC.
 * Copyright (c) Microsoft Corporation.
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
 *
 */
Object.defineProperty(networkRequest, "__esModule", { value: true });
networkRequest.NetworkRequest = void 0;
const deferred_1$1 = deferred;
const protocol_1$1 = protocol;
class NetworkRequest {
    static #unknown = 'UNKNOWN';
    requestId;
    #eventManager;
    #requestWillBeSentEvent;
    #requestWillBeSentExtraInfoEvent;
    #responseReceivedEvent;
    #responseReceivedExtraInfoEvent;
    #beforeRequestSentDeferred;
    #responseReceivedDeferred;
    constructor(requestId, eventManager) {
        this.requestId = requestId;
        this.#eventManager = eventManager;
        this.#beforeRequestSentDeferred = new deferred_1$1.Deferred();
        this.#responseReceivedDeferred = new deferred_1$1.Deferred();
    }
    onRequestWillBeSentEvent(requestWillBeSentEvent) {
        if (this.#requestWillBeSentEvent !== undefined) {
            throw new Error('RequestWillBeSentEvent is already set');
        }
        this.#requestWillBeSentEvent = requestWillBeSentEvent;
        if (this.#requestWillBeSentExtraInfoEvent !== undefined) {
            this.#beforeRequestSentDeferred.resolve();
        }
        this.#sendBeforeRequestEvent();
    }
    onRequestWillBeSentExtraInfoEvent(requestWillBeSentExtraInfoEvent) {
        if (this.#requestWillBeSentExtraInfoEvent !== undefined) {
            throw new Error('RequestWillBeSentExtraInfoEvent is already set');
        }
        this.#requestWillBeSentExtraInfoEvent = requestWillBeSentExtraInfoEvent;
        if (this.#requestWillBeSentEvent !== undefined) {
            this.#beforeRequestSentDeferred.resolve();
        }
    }
    onResponseReceivedEvent(responseReceivedEvent) {
        if (this.#responseReceivedEvent !== undefined) {
            throw new Error('ResponseReceivedEvent is already set');
        }
        this.#responseReceivedEvent = responseReceivedEvent;
        if (this.#responseReceivedExtraInfoEvent !== undefined) {
            this.#responseReceivedDeferred.resolve();
        }
        this.#sendResponseReceivedEvent();
    }
    onResponseReceivedEventExtraInfo(responseReceivedExtraInfoEvent) {
        if (this.#responseReceivedExtraInfoEvent !== undefined) {
            throw new Error('ResponseReceivedExtraInfoEvent is already set');
        }
        this.#responseReceivedExtraInfoEvent = responseReceivedExtraInfoEvent;
        if (this.#responseReceivedEvent !== undefined) {
            this.#responseReceivedDeferred.resolve();
        }
    }
    onLoadingFailedEvent(loadingFailedEvent) {
        this.#beforeRequestSentDeferred.resolve();
        this.#responseReceivedDeferred.reject(loadingFailedEvent);
        const params = {
            ...this.#getBaseEventParams(),
            errorText: loadingFailedEvent.errorText,
        };
        this.#eventManager.registerEvent({
            method: protocol_1$1.Network.EventNames.FetchErrorEvent,
            params,
        }, this.#requestWillBeSentEvent?.frameId ?? null);
    }
    #sendBeforeRequestEvent() {
        if (!this.#isIgnoredEvent()) {
            this.#eventManager.registerPromiseEvent(this.#beforeRequestSentDeferred.then(() => this.#getBeforeRequestEvent()), this.#requestWillBeSentEvent?.frameId ?? null, protocol_1$1.Network.EventNames.BeforeRequestSentEvent);
        }
    }
    #getBeforeRequestEvent() {
        if (this.#requestWillBeSentEvent === undefined) {
            throw new Error('RequestWillBeSentEvent is not set');
        }
        const params = {
            ...this.#getBaseEventParams(),
            initiator: { type: this.#getInitiatorType() },
        };
        return {
            method: protocol_1$1.Network.EventNames.BeforeRequestSentEvent,
            params,
        };
    }
    #getBaseEventParams() {
        return {
            context: this.#requestWillBeSentEvent?.frameId ?? null,
            navigation: this.#requestWillBeSentEvent?.loaderId ?? null,
            // TODO: implement.
            redirectCount: 0,
            request: this.#getRequestData(),
            // Timestamp should be in milliseconds, while CDP provides it in seconds.
            timestamp: Math.round((this.#requestWillBeSentEvent?.wallTime ?? 0) * 1000),
        };
    }
    #getRequestData() {
        const cookies = this.#requestWillBeSentExtraInfoEvent === undefined
            ? []
            : NetworkRequest.#getCookies(this.#requestWillBeSentExtraInfoEvent.associatedCookies);
        return {
            request: this.#requestWillBeSentEvent?.requestId ?? NetworkRequest.#unknown,
            url: this.#requestWillBeSentEvent?.request.url ?? NetworkRequest.#unknown,
            method: this.#requestWillBeSentEvent?.request.method ?? NetworkRequest.#unknown,
            headers: Object.keys(this.#requestWillBeSentEvent?.request.headers ?? []).map((key) => ({
                name: key,
                value: this.#requestWillBeSentEvent?.request.headers[key],
            })),
            cookies,
            // TODO: implement.
            headersSize: -1,
            // TODO: implement.
            bodySize: 0,
            timings: {
                // TODO: implement.
                timeOrigin: 0,
                // TODO: implement.
                requestTime: 0,
                // TODO: implement.
                redirectStart: 0,
                // TODO: implement.
                redirectEnd: 0,
                // TODO: implement.
                fetchStart: 0,
                // TODO: implement.
                dnsStart: 0,
                // TODO: implement.
                dnsEnd: 0,
                // TODO: implement.
                connectStart: 0,
                // TODO: implement.
                connectEnd: 0,
                // TODO: implement.
                tlsStart: 0,
                // TODO: implement.
                tlsEnd: 0,
                // TODO: implement.
                requestStart: 0,
                // TODO: implement.
                responseStart: 0,
                // TODO: implement.
                responseEnd: 0,
            },
        };
    }
    #getInitiatorType() {
        switch (this.#requestWillBeSentEvent?.initiator.type) {
            case 'parser':
            case 'script':
            case 'preflight':
                return this.#requestWillBeSentEvent.initiator.type;
            default:
                return 'other';
        }
    }
    static #getCookiesSameSite(cdpSameSiteValue) {
        switch (cdpSameSiteValue) {
            case 'Strict':
                return 'strict';
            case 'Lax':
                return 'lax';
            default:
                return 'none';
        }
    }
    static #getCookies(associatedCookies) {
        return associatedCookies.map((cookieInfo) => {
            return {
                name: cookieInfo.cookie.name,
                value: cookieInfo.cookie.value,
                domain: cookieInfo.cookie.domain,
                path: cookieInfo.cookie.path,
                expires: cookieInfo.cookie.expires,
                size: cookieInfo.cookie.size,
                httpOnly: cookieInfo.cookie.httpOnly,
                secure: cookieInfo.cookie.secure,
                sameSite: NetworkRequest.#getCookiesSameSite(cookieInfo.cookie.sameSite),
            };
        });
    }
    #sendResponseReceivedEvent() {
        if (!this.#isIgnoredEvent()) {
            // Wait for both ResponseReceived and ResponseReceivedExtraInfo events.
            this.#eventManager.registerPromiseEvent(this.#responseReceivedDeferred.then(() => this.#getResponseReceivedEvent()), this.#responseReceivedEvent?.frameId ?? null, protocol_1$1.Network.EventNames.ResponseCompletedEvent);
        }
    }
    #getResponseReceivedEvent() {
        if (this.#responseReceivedEvent === undefined) {
            throw new Error('ResponseReceivedEvent is not set');
        }
        if (this.#requestWillBeSentEvent === undefined) {
            throw new Error('RequestWillBeSentEvent is not set');
        }
        return {
            method: protocol_1$1.Network.EventNames.ResponseCompletedEvent,
            params: {
                ...this.#getBaseEventParams(),
                response: {
                    url: this.#responseReceivedEvent.response.url,
                    protocol: this.#responseReceivedEvent.response.protocol,
                    status: this.#responseReceivedEvent.response.status,
                    statusText: this.#responseReceivedEvent.response.statusText,
                    // Check if this is correct.
                    fromCache: this.#responseReceivedEvent.response.fromDiskCache ||
                        this.#responseReceivedEvent.response.fromPrefetchCache,
                    // TODO: implement.
                    headers: this.#getHeaders(this.#responseReceivedEvent.response.headers),
                    mimeType: this.#responseReceivedEvent.response.mimeType,
                    bytesReceived: this.#responseReceivedEvent.response.encodedDataLength,
                    headersSize: this.#responseReceivedExtraInfoEvent?.headersText?.length ?? -1,
                    // TODO: consider removing from spec.
                    bodySize: -1,
                    content: {
                        // TODO: consider removing from spec.
                        size: -1,
                    },
                },
            },
        };
    }
    #getHeaders(headers) {
        return Object.keys(headers).map((key) => ({
            name: key,
            value: headers[key],
        }));
    }
    #isIgnoredEvent() {
        return (this.#requestWillBeSentEvent?.request.url.endsWith('/favicon.ico') ??
            false);
    }
}
networkRequest.NetworkRequest = NetworkRequest;

/*
 * Copyright 2023 Google LLC.
 * Copyright (c) Microsoft Corporation.
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
Object.defineProperty(networkProcessor, "__esModule", { value: true });
networkProcessor.NetworkProcessor = void 0;
const DefaultMap_1 = DefaultMap$1;
const networkRequest_1 = networkRequest;
class NetworkProcessor {
    #eventManager;
    /**
     * Map of request ID to NetworkRequest objects. Needed as long as information
     * about requests comes from different events.
     */
    #requestMap;
    constructor(eventManager) {
        this.#eventManager = eventManager;
        this.#requestMap = new DefaultMap_1.DefaultMap((requestId) => new networkRequest_1.NetworkRequest(requestId, this.#eventManager));
    }
    static async create(cdpClient, eventManager) {
        const networkProcessor = new NetworkProcessor(eventManager);
        cdpClient.on('Network.requestWillBeSent', (params) => {
            networkProcessor
                .#getOrCreateNetworkRequest(params.requestId)
                .onRequestWillBeSentEvent(params);
        });
        cdpClient.on('Network.requestWillBeSentExtraInfo', (params) => {
            networkProcessor
                .#getOrCreateNetworkRequest(params.requestId)
                .onRequestWillBeSentExtraInfoEvent(params);
        });
        cdpClient.on('Network.responseReceived', (params) => {
            networkProcessor
                .#getOrCreateNetworkRequest(params.requestId)
                .onResponseReceivedEvent(params);
        });
        cdpClient.on('Network.responseReceivedExtraInfo', (params) => {
            networkProcessor
                .#getOrCreateNetworkRequest(params.requestId)
                .onResponseReceivedEventExtraInfo(params);
        });
        cdpClient.on('Network.loadingFailed', (params) => {
            networkProcessor
                .#getOrCreateNetworkRequest(params.requestId)
                .onLoadingFailedEvent(params);
        });
        await cdpClient.sendCommand('Network.enable');
        return networkProcessor;
    }
    #getOrCreateNetworkRequest(requestId) {
        return this.#requestMap.get(requestId);
    }
}
networkProcessor.NetworkProcessor = NetworkProcessor;

/*
 * Copyright 2023 Google LLC.
 * Copyright (c) Microsoft Corporation.
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
 *
 */
Object.defineProperty(cdpTarget, "__esModule", { value: true });
cdpTarget.CdpTarget = void 0;
const logManager_1 = logManager;
const protocol_1 = protocol;
const deferred_1 = deferred;
const networkProcessor_1 = networkProcessor;
class CdpTarget {
    #targetUnblocked;
    #targetId;
    #cdpClient;
    #eventManager;
    #cdpSessionId;
    #networkDomainActivated;
    static create(targetId, cdpClient, cdpSessionId, realmStorage, eventManager) {
        const cdpTarget = new CdpTarget(targetId, cdpClient, cdpSessionId, eventManager);
        logManager_1.LogManager.create(cdpTarget, realmStorage, eventManager);
        cdpTarget.#setEventListeners();
        // No need in waiting. Deferred will be resolved when the target is unblocked.
        void cdpTarget.#unblock();
        return cdpTarget;
    }
    constructor(targetId, cdpClient, cdpSessionId, eventManager) {
        this.#targetId = targetId;
        this.#cdpClient = cdpClient;
        this.#cdpSessionId = cdpSessionId;
        this.#eventManager = eventManager;
        this.#networkDomainActivated = false;
        this.#targetUnblocked = new deferred_1.Deferred();
    }
    /**
     * Returns a promise that resolves when the target is unblocked.
     */
    get targetUnblocked() {
        return this.#targetUnblocked;
    }
    get targetId() {
        return this.#targetId;
    }
    get cdpClient() {
        return this.#cdpClient;
    }
    /**
     * Needed for CDP escape path.
     */
    get cdpSessionId() {
        return this.#cdpSessionId;
    }
    /**
     * Enables all the required CDP domains and unblocks the target.
     */
    async #unblock() {
        // Enable Network domain, if it is enabled globally.
        // TODO: enable Network domain for OOPiF targets.
        if (this.#eventManager.isNetworkDomainEnabled) {
            await this.enableNetworkDomain();
        }
        await this.#cdpClient.sendCommand('Runtime.enable');
        await this.#cdpClient.sendCommand('Page.enable');
        await this.#cdpClient.sendCommand('Page.setLifecycleEventsEnabled', {
            enabled: true,
        });
        await this.#cdpClient.sendCommand('Target.setAutoAttach', {
            autoAttach: true,
            waitForDebuggerOnStart: true,
            flatten: true,
        });
        await this.#cdpClient.sendCommand('Runtime.runIfWaitingForDebugger');
        this.#targetUnblocked.resolve();
    }
    /**
     * Enables the Network domain (creates NetworkProcessor on the target's cdp
     * client) if it is not enabled yet.
     */
    async enableNetworkDomain() {
        if (!this.#networkDomainActivated) {
            this.#networkDomainActivated = true;
            await networkProcessor_1.NetworkProcessor.create(this.cdpClient, this.#eventManager);
        }
    }
    #setEventListeners() {
        this.#cdpClient.on('*', (method, params) => {
            this.#eventManager.registerEvent({
                method: protocol_1.CDP.EventNames.EventReceivedEvent,
                params: {
                    cdpMethod: method,
                    cdpParams: params || {},
                    cdpSession: this.#cdpSessionId,
                },
            }, null);
        });
    }
}
cdpTarget.CdpTarget = CdpTarget;

Object.defineProperty(browsingContextProcessor, "__esModule", { value: true });
browsingContextProcessor.BrowsingContextProcessor = void 0;
const protocol_js_1$5 = protocol;
const log_js_1$1 = log;
const browsingContextImpl_js_1 = browsingContextImpl;
const cdpTarget_js_1 = cdpTarget;
class BrowsingContextProcessor {
    #browsingContextStorage;
    #cdpConnection;
    #eventManager;
    #logger;
    #realmStorage;
    #selfTargetId;
    constructor(realmStorage, cdpConnection, selfTargetId, eventManager, browsingContextStorage, logger) {
        this.#browsingContextStorage = browsingContextStorage;
        this.#cdpConnection = cdpConnection;
        this.#eventManager = eventManager;
        this.#logger = logger;
        this.#realmStorage = realmStorage;
        this.#selfTargetId = selfTargetId;
        this.#setEventListeners(this.#cdpConnection.browserClient());
    }
    /**
     * This method is called for each CDP session, since this class is responsible
     * for creating and destroying all targets and browsing contexts.
     */
    #setEventListeners(cdpClient) {
        cdpClient.on('Target.attachedToTarget', (params) => {
            this.#handleAttachedToTargetEvent(params, cdpClient);
        });
        cdpClient.on('Target.detachedFromTarget', (params) => {
            this.#handleDetachedFromTargetEvent(params);
        });
        cdpClient.on('Page.frameAttached', (params) => {
            this.#handleFrameAttachedEvent(params);
        });
        cdpClient.on('Page.frameDetached', (params) => {
            this.#handleFrameDetachedEvent(params);
        });
    }
    // { "method": "Page.frameAttached",
    //   "params": {
    //     "frameId": "0A639AB1D9A392DF2CE02C53CC4ED3A6",
    //     "parentFrameId": "722BB0526C73B067A479BED6D0DB1156" } }
    #handleFrameAttachedEvent(params) {
        const parentBrowsingContext = this.#browsingContextStorage.findContext(params.parentFrameId);
        if (parentBrowsingContext !== undefined) {
            browsingContextImpl_js_1.BrowsingContextImpl.create(parentBrowsingContext.cdpTarget, this.#realmStorage, params.frameId, params.parentFrameId, this.#eventManager, this.#browsingContextStorage, this.#logger);
        }
    }
    // { "method": "Page.frameDetached",
    //   "params": {
    //     "frameId": "0A639AB1D9A392DF2CE02C53CC4ED3A6",
    //     "reason": "swap" } }
    #handleFrameDetachedEvent(params) {
        // In case of OOPiF no need in deleting BrowsingContext.
        if (params.reason === 'swap') {
            return;
        }
        this.#browsingContextStorage.findContext(params.frameId)?.delete();
    }
    // { "method": "Target.attachedToTarget",
    //   "params": {
    //     "sessionId": "EA999F39BDCABD7D45C9FEB787413BBA",
    //     "targetInfo": {
    //       "targetId": "722BB0526C73B067A479BED6D0DB1156",
    //       "type": "page",
    //       "title": "about:blank",
    //       "url": "about:blank",
    //       "attached": true,
    //       "canAccessOpener": false,
    //       "browserContextId": "1B5244080EC3FF28D03BBDA73138C0E2" },
    //     "waitingForDebugger": false } }
    #handleAttachedToTargetEvent(params, parentSessionCdpClient) {
        const { sessionId, targetInfo } = params;
        const targetCdpClient = this.#cdpConnection.getCdpClient(sessionId);
        if (!this.#isValidTarget(targetInfo)) {
            // DevTools or some other not supported by BiDi target. Just release
            // debugger  and ignore them.
            void targetCdpClient
                .sendCommand('Runtime.runIfWaitingForDebugger')
                .then(() => parentSessionCdpClient.sendCommand('Target.detachFromTarget', params));
            return;
        }
        this.#logger?.(log_js_1$1.LogType.browsingContexts, 'AttachedToTarget event received:', JSON.stringify(params, null, 2));
        this.#setEventListeners(targetCdpClient);
        const cdpTarget = cdpTarget_js_1.CdpTarget.create(targetInfo.targetId, targetCdpClient, sessionId, this.#realmStorage, this.#eventManager);
        if (this.#browsingContextStorage.hasContext(targetInfo.targetId)) {
            // OOPiF.
            this.#browsingContextStorage
                .getContext(targetInfo.targetId)
                .updateCdpTarget(cdpTarget);
        }
        else {
            browsingContextImpl_js_1.BrowsingContextImpl.create(cdpTarget, this.#realmStorage, targetInfo.targetId, null, this.#eventManager, this.#browsingContextStorage, this.#logger);
        }
    }
    // { "method": "Target.detachedFromTarget",
    //   "params": {
    //     "sessionId": "7EFBFB2A4942A8989B3EADC561BC46E9",
    //     "targetId": "19416886405CBA4E03DBB59FA67FF4E8" } }
    #handleDetachedFromTargetEvent(params) {
        // TODO: params.targetId is deprecated. Update this class to track using
        // params.sessionId instead.
        // https://github.com/GoogleChromeLabs/chromium-bidi/issues/60
        const contextId = params.targetId;
        this.#browsingContextStorage.findContext(contextId)?.delete();
    }
    async #getRealm(target) {
        if ('realm' in target) {
            return this.#realmStorage.getRealm({
                realmId: target.realm,
            });
        }
        const context = this.#browsingContextStorage.getContext(target.context);
        return context.getOrCreateSandbox(target.sandbox);
    }
    process_browsingContext_getTree(params) {
        const resultContexts = params.root === undefined
            ? this.#browsingContextStorage.getTopLevelContexts()
            : [this.#browsingContextStorage.getContext(params.root)];
        return {
            result: {
                contexts: resultContexts.map((c) => c.serializeToBidiValue(params.maxDepth ?? Number.MAX_VALUE)),
            },
        };
    }
    async process_browsingContext_create(params) {
        const browserCdpClient = this.#cdpConnection.browserClient();
        let referenceContext = undefined;
        if (params.referenceContext !== undefined) {
            referenceContext = this.#browsingContextStorage.getContext(params.referenceContext);
            if (!referenceContext.isTopLevelContext()) {
                throw new protocol_js_1$5.Message.InvalidArgumentException(`referenceContext should be a top-level context`);
            }
        }
        const result = await browserCdpClient.sendCommand('Target.createTarget', {
            url: 'about:blank',
            newWindow: params.type === 'window',
        });
        // Wait for the new tab to be loaded to avoid race conditions in the
        // `browsingContext` events, when the `browsingContext.domContentLoaded` and
        // `browsingContext.load` events from the initial `about:blank` navigation
        // are emitted after the next navigation is started.
        // Details: https://github.com/web-platform-tests/wpt/issues/35846
        const contextId = result.targetId;
        const context = this.#browsingContextStorage.getContext(contextId);
        await context.awaitLoaded();
        return {
            result: context.serializeToBidiValue(1),
        };
    }
    process_browsingContext_navigate(params) {
        const context = this.#browsingContextStorage.getContext(params.context);
        return context.navigate(params.url, params.wait === undefined ? 'none' : params.wait);
    }
    async process_browsingContext_captureScreenshot(params) {
        const context = this.#browsingContextStorage.getContext(params.context);
        return context.captureScreenshot();
    }
    async process_browsingContext_print(params) {
        const context = this.#browsingContextStorage.getContext(params.context);
        return context.print(params);
    }
    async process_script_addPreloadScript(params) {
        const contexts = [];
        const scripts = [];
        if (params.context) {
            // TODO(#293): Handle edge case with OOPiF. Whenever a frame is moved out
            // of process, we have to add those scripts as well.
            contexts.push(this.#browsingContextStorage.getContext(params.context));
        }
        else {
            // Add all contexts.
            // TODO(#293): Add preload scripts to all new browsing contexts as well.
            contexts.push(...this.#browsingContextStorage.getAllContexts());
        }
        scripts.push(...(await Promise.all(contexts.map((context) => context.addPreloadScript(params)))));
        // TODO(#293): What to return whenever there are multiple contexts?
        return scripts[0];
    }
    // eslint-disable-next-line @typescript-eslint/require-await
    async process_script_removePreloadScript(_params) {
        throw new protocol_js_1$5.Message.UnknownErrorException('Not implemented.');
    }
    async process_script_evaluate(params) {
        const realm = await this.#getRealm(params.target);
        return realm.scriptEvaluate(params.expression, params.awaitPromise, params.resultOwnership ?? 'none');
    }
    process_script_getRealms(params) {
        if (params.context !== undefined) {
            // Make sure the context is known.
            this.#browsingContextStorage.getContext(params.context);
        }
        const realms = this.#realmStorage
            .findRealms({
            browsingContextId: params.context,
            type: params.type,
        })
            .map((realm) => realm.toBiDi());
        return { result: { realms } };
    }
    async process_script_callFunction(params) {
        const realm = await this.#getRealm(params.target);
        return realm.callFunction(params.functionDeclaration, params.this || {
            type: 'undefined',
        }, // `this` is `undefined` by default.
        params.arguments || [], // `arguments` is `[]` by default.
        params.awaitPromise, params.resultOwnership ?? 'none');
    }
    async process_script_disown(params) {
        const realm = await this.#getRealm(params.target);
        await Promise.all(params.handles.map(async (h) => realm.disown(h)));
        return { result: {} };
    }
    async process_browsingContext_close(commandParams) {
        const browserCdpClient = this.#cdpConnection.browserClient();
        const context = this.#browsingContextStorage.getContext(commandParams.context);
        if (!context.isTopLevelContext()) {
            throw new protocol_js_1$5.Message.InvalidArgumentException('A top-level browsing context cannot be closed.');
        }
        const detachedFromTargetPromise = new Promise((resolve) => {
            const onContextDestroyed = (eventParams) => {
                if (eventParams.targetId === commandParams.context) {
                    browserCdpClient.off('Target.detachedFromTarget', onContextDestroyed);
                    resolve();
                }
            };
            browserCdpClient.on('Target.detachedFromTarget', onContextDestroyed);
        });
        await browserCdpClient.sendCommand('Target.closeTarget', {
            targetId: commandParams.context,
        });
        // Sometimes CDP command finishes before `detachedFromTarget` event,
        // sometimes after. Wait for the CDP command to be finished, and then wait
        // for `detachedFromTarget` if it hasn't emitted.
        await detachedFromTargetPromise;
        return { result: {} };
    }
    #isValidTarget(target) {
        if (target.targetId === this.#selfTargetId) {
            return false;
        }
        return ['page', 'iframe'].includes(target.type);
    }
    async process_cdp_sendCommand(params) {
        const client = params.cdpSession
            ? this.#cdpConnection.getCdpClient(params.cdpSession)
            : this.#cdpConnection.browserClient();
        const sendCdpCommandResult = await client.sendCommand(params.cdpMethod, params.cdpParams);
        return {
            result: sendCdpCommandResult,
            cdpSession: params.cdpSession,
        };
    }
    process_cdp_getSession(params) {
        const context = params.context;
        const sessionId = this.#browsingContextStorage.getContext(context).cdpTarget.cdpSessionId;
        if (sessionId === undefined) {
            return { result: { cdpSession: null } };
        }
        return { result: { cdpSession: sessionId } };
    }
}
browsingContextProcessor.BrowsingContextProcessor = BrowsingContextProcessor;

var OutgoingBidiMessage$1 = {};

/**
 * Copyright 2021 Google LLC.
 * Copyright (c) Microsoft Corporation.
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
Object.defineProperty(OutgoingBidiMessage$1, "__esModule", { value: true });
OutgoingBidiMessage$1.OutgoingBidiMessage = void 0;
class OutgoingBidiMessage {
    #message;
    #channel;
    constructor(message, channel) {
        this.#message = message;
        this.#channel = channel;
    }
    static async createFromPromise(messagePromise, channel) {
        return messagePromise.then((message) => new OutgoingBidiMessage(message, channel));
    }
    static createResolved(message, channel) {
        return Promise.resolve(new OutgoingBidiMessage(message, channel));
    }
    get message() {
        return this.#message;
    }
    get channel() {
        return this.#channel;
    }
}
OutgoingBidiMessage$1.OutgoingBidiMessage = OutgoingBidiMessage;

/**
 * Copyright 2021 Google LLC.
 * Copyright (c) Microsoft Corporation.
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
Object.defineProperty(CommandProcessor$1, "__esModule", { value: true });
CommandProcessor$1.CommandProcessor = void 0;
const protocol_js_1$4 = protocol;
const log_js_1 = log;
const EventEmitter_js_1$1 = EventEmitter$1;
const browsingContextProcessor_js_1 = browsingContextProcessor;
const OutgoingBidiMessage_js_1$1 = OutgoingBidiMessage$1;
class BidiNoOpParser {
    parseAddPreloadScriptParams(params) {
        return params;
    }
    parseRemovePreloadScriptParams(params) {
        return params;
    }
    parseGetRealmsParams(params) {
        return params;
    }
    parseCallFunctionParams(params) {
        return params;
    }
    parseEvaluateParams(params) {
        return params;
    }
    parseDisownParams(params) {
        return params;
    }
    parseSendCommandParams(params) {
        return params;
    }
    parseGetSessionParams(params) {
        return params;
    }
    parseSubscribeParams(params) {
        return params;
    }
    parseNavigateParams(params) {
        return params;
    }
    parseGetTreeParams(params) {
        return params;
    }
    parseCreateParams(params) {
        return params;
    }
    parseCloseParams(params) {
        return params;
    }
    parseCaptureScreenshotParams(params) {
        return params;
    }
    parsePrintParams(params) {
        return params;
    }
}
class CommandProcessor extends EventEmitter_js_1$1.EventEmitter {
    #contextProcessor;
    #eventManager;
    #parser;
    #logger;
    constructor(realmStorage, cdpConnection, eventManager, selfTargetId, parser = new BidiNoOpParser(), browsingContextStorage, logger) {
        super();
        this.#eventManager = eventManager;
        this.#logger = logger;
        this.#contextProcessor = new browsingContextProcessor_js_1.BrowsingContextProcessor(realmStorage, cdpConnection, selfTargetId, eventManager, browsingContextStorage, logger);
        this.#parser = parser;
    }
    static #process_session_status() {
        return { result: { ready: false, message: 'already connected' } };
    }
    async #process_session_subscribe(params, channel) {
        await this.#eventManager.subscribe(params.events, params.contexts ?? [null], channel);
        return { result: {} };
    }
    async #process_session_unsubscribe(params, channel) {
        await this.#eventManager.unsubscribe(params.events, params.contexts ?? [null], channel);
        return { result: {} };
    }
    async #processCommand(commandData) {
        switch (commandData.method) {
            case 'session.status':
                return CommandProcessor.#process_session_status();
            case 'session.subscribe':
                return this.#process_session_subscribe(this.#parser.parseSubscribeParams(commandData.params), commandData.channel ?? null);
            case 'session.unsubscribe':
                return this.#process_session_unsubscribe(this.#parser.parseSubscribeParams(commandData.params), commandData.channel ?? null);
            case 'browsingContext.create':
                return this.#contextProcessor.process_browsingContext_create(this.#parser.parseCreateParams(commandData.params));
            case 'browsingContext.close':
                return this.#contextProcessor.process_browsingContext_close(this.#parser.parseCloseParams(commandData.params));
            case 'browsingContext.getTree':
                return this.#contextProcessor.process_browsingContext_getTree(this.#parser.parseGetTreeParams(commandData.params));
            case 'browsingContext.navigate':
                return this.#contextProcessor.process_browsingContext_navigate(this.#parser.parseNavigateParams(commandData.params));
            case 'browsingContext.captureScreenshot':
                return this.#contextProcessor.process_browsingContext_captureScreenshot(this.#parser.parseCaptureScreenshotParams(commandData.params));
            case 'browsingContext.print':
                return this.#contextProcessor.process_browsingContext_print(this.#parser.parsePrintParams(commandData.params));
            case 'script.addPreloadScript':
                return this.#contextProcessor.process_script_addPreloadScript(this.#parser.parseAddPreloadScriptParams(commandData.params));
            case 'script.removePreloadScript':
                return this.#contextProcessor.process_script_removePreloadScript(this.#parser.parseRemovePreloadScriptParams(commandData.params));
            case 'script.getRealms':
                return this.#contextProcessor.process_script_getRealms(this.#parser.parseGetRealmsParams(commandData.params));
            case 'script.callFunction':
                return this.#contextProcessor.process_script_callFunction(this.#parser.parseCallFunctionParams(commandData.params));
            case 'script.evaluate':
                return this.#contextProcessor.process_script_evaluate(this.#parser.parseEvaluateParams(commandData.params));
            case 'script.disown':
                return this.#contextProcessor.process_script_disown(this.#parser.parseDisownParams(commandData.params));
            case 'cdp.sendCommand':
                return this.#contextProcessor.process_cdp_sendCommand(this.#parser.parseSendCommandParams(commandData.params));
            case 'cdp.getSession':
                return this.#contextProcessor.process_cdp_getSession(this.#parser.parseGetSessionParams(commandData.params));
            default:
                throw new protocol_js_1$4.Message.UnknownCommandException(`Unknown command '${commandData.method}'.`);
        }
    }
    async processCommand(command) {
        try {
            const result = await this.#processCommand(command);
            const response = {
                id: command.id,
                ...result,
            };
            this.emit('response', OutgoingBidiMessage_js_1$1.OutgoingBidiMessage.createResolved(response, command.channel ?? null));
        }
        catch (e) {
            if (e instanceof protocol_js_1$4.Message.ErrorResponse) {
                const errorResponse = e;
                this.emit('response', OutgoingBidiMessage_js_1$1.OutgoingBidiMessage.createResolved(errorResponse.toErrorResponse(command.id), command.channel ?? null));
            }
            else {
                const error = e;
                this.#logger?.(log_js_1.LogType.bidi, error);
                this.emit('response', OutgoingBidiMessage_js_1$1.OutgoingBidiMessage.createResolved(new protocol_js_1$4.Message.ErrorResponse(protocol_js_1$4.Message.ErrorCode.UnknownError, error.message).toErrorResponse(command.id), command.channel ?? null));
            }
        }
    }
}
CommandProcessor$1.CommandProcessor = CommandProcessor;

var browsingContextStorage = {};

/**
 * Copyright 2022 Google LLC.
 * Copyright (c) Microsoft Corporation.
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
Object.defineProperty(browsingContextStorage, "__esModule", { value: true });
browsingContextStorage.BrowsingContextStorage = void 0;
const protocol_js_1$3 = protocol;
/** Container class for browsing contexts. */
class BrowsingContextStorage {
    /** Map from context ID to context implementation. */
    #contexts = new Map();
    /** Gets all top-level contexts, i.e. those with no parent. */
    getTopLevelContexts() {
        return this.getAllContexts().filter((c) => c.isTopLevelContext());
    }
    /** Gets all contexts. */
    getAllContexts() {
        return Array.from(this.#contexts.values());
    }
    /** Deletes the context with the given ID. */
    deleteContext(contextId) {
        this.#contexts.delete(contextId);
    }
    /** Adds the given context. */
    addContext(context) {
        this.#contexts.set(context.contextId, context);
        if (!context.isTopLevelContext()) {
            this.getContext(context.parentId).addChild(context);
        }
    }
    /** Returns true whether there is an existing context with the given ID. */
    hasContext(contextId) {
        return this.#contexts.has(contextId);
    }
    /** Gets the context with the given ID, if any. */
    findContext(contextId) {
        return this.#contexts.get(contextId);
    }
    /** Returns the top-level context ID of the given context, if any. */
    findTopLevelContextId(contextId) {
        if (contextId === null) {
            return null;
        }
        const maybeContext = this.findContext(contextId);
        const parentId = maybeContext?.parentId ?? null;
        if (parentId === null) {
            return contextId;
        }
        return this.findTopLevelContextId(parentId);
    }
    /** Gets the context with the given ID, if any, otherwise throws. */
    getContext(contextId) {
        const result = this.findContext(contextId);
        if (result === undefined) {
            throw new protocol_js_1$3.Message.NoSuchFrameException(`Context ${contextId} not found`);
        }
        return result;
    }
}
browsingContextStorage.BrowsingContextStorage = BrowsingContextStorage;

var EventManager$1 = {};

var buffer = {};

/**
 * Copyright 2022 Google LLC.
 * Copyright (c) Microsoft Corporation.
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
Object.defineProperty(buffer, "__esModule", { value: true });
buffer.Buffer = void 0;
/**
 * Implements a FIFO buffer with a fixed size.
 */
let Buffer$1 = class Buffer {
    #capacity;
    #entries = [];
    #onItemRemoved;
    /**
     * @param capacity
     * @param onItemRemoved optional delegate called for each removed element.
     */
    constructor(capacity, onItemRemoved = () => { }) {
        this.#capacity = capacity;
        this.#onItemRemoved = onItemRemoved;
    }
    get() {
        return this.#entries;
    }
    add(value) {
        this.#entries.push(value);
        while (this.#entries.length > this.#capacity) {
            const item = this.#entries.shift();
            if (item !== undefined) {
                this.#onItemRemoved(item);
            }
        }
    }
};
buffer.Buffer = Buffer$1;

var idWrapper = {};

/**
 * Copyright 2022 Google LLC.
 * Copyright (c) Microsoft Corporation.
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
Object.defineProperty(idWrapper, "__esModule", { value: true });
idWrapper.IdWrapper = void 0;
/**
 * Creates an object with a positive unique incrementing id.
 */
class IdWrapper {
    static #counter = 0;
    #id;
    constructor() {
        this.#id = ++IdWrapper.#counter;
    }
    get id() {
        return this.#id;
    }
}
idWrapper.IdWrapper = IdWrapper;

var SubscriptionManager$1 = {};

/**
 * Copyright 2022 Google LLC.
 * Copyright (c) Microsoft Corporation.
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
Object.defineProperty(SubscriptionManager$1, "__esModule", { value: true });
SubscriptionManager$1.SubscriptionManager = SubscriptionManager$1.unrollEvents = SubscriptionManager$1.cartesianProduct = void 0;
const protocol_js_1$2 = protocol;
/**
 * Returns the cartesian product of the given arrays.
 *
 * Example:
 *   cartesian([1, 2], ['a', 'b']); => [[1, 'a'], [1, 'b'], [2, 'a'], [2, 'b']]
 */
function cartesianProduct(...a) {
    return a.reduce((a, b) => a.flatMap((d) => b.map((e) => [d, e].flat())));
}
SubscriptionManager$1.cartesianProduct = cartesianProduct;
/** Expands "AllEvents" events into atomic events. */
function unrollEvents(events) {
    const allEvents = [];
    for (const event of events) {
        switch (event) {
            case protocol_js_1$2.BrowsingContext.AllEvents:
                allEvents.push(...Object.values(protocol_js_1$2.BrowsingContext.EventNames));
                break;
            case protocol_js_1$2.CDP.AllEvents:
                allEvents.push(...Object.values(protocol_js_1$2.CDP.EventNames));
                break;
            case protocol_js_1$2.Log.AllEvents:
                allEvents.push(...Object.values(protocol_js_1$2.Log.EventNames));
                break;
            case protocol_js_1$2.Network.AllEvents:
                allEvents.push(...Object.values(protocol_js_1$2.Network.EventNames));
                break;
            case protocol_js_1$2.Script.AllEvents:
                allEvents.push(...Object.values(protocol_js_1$2.Script.EventNames));
                break;
            default:
                allEvents.push(event);
        }
    }
    return allEvents;
}
SubscriptionManager$1.unrollEvents = unrollEvents;
class SubscriptionManager {
    #subscriptionPriority = 0;
    // BrowsingContext `null` means the event has subscription across all the
    // browsing contexts.
    // Channel `null` means no `channel` should be added.
    #channelToContextToEventMap = new Map();
    #browsingContextStorage;
    constructor(browsingContextStorage) {
        this.#browsingContextStorage = browsingContextStorage;
    }
    getChannelsSubscribedToEvent(eventMethod, contextId) {
        const prioritiesAndChannels = Array.from(this.#channelToContextToEventMap.keys())
            .map((channel) => ({
            priority: this.#getEventSubscriptionPriorityForChannel(eventMethod, contextId, channel),
            channel,
        }))
            .filter(({ priority }) => priority !== null);
        // Sort channels by priority.
        return prioritiesAndChannels
            .sort((a, b) => a.priority - b.priority)
            .map(({ channel }) => channel);
    }
    #getEventSubscriptionPriorityForChannel(eventMethod, contextId, channel) {
        const contextToEventMap = this.#channelToContextToEventMap.get(channel);
        if (contextToEventMap === undefined) {
            return null;
        }
        const maybeTopLevelContextId = this.#browsingContextStorage.findTopLevelContextId(contextId);
        // `null` covers global subscription.
        const relevantContexts = [...new Set([null, maybeTopLevelContextId])];
        // Get all the subscription priorities.
        const priorities = relevantContexts
            .map((c) => contextToEventMap.get(c)?.get(eventMethod))
            .filter((p) => p !== undefined);
        if (priorities.length === 0) {
            // Not subscribed, return null.
            return null;
        }
        // Return minimal priority.
        return Math.min(...priorities);
    }
    subscribe(event, contextId, channel) {
        // All the subscriptions are handled on the top-level contexts.
        contextId = this.#browsingContextStorage.findTopLevelContextId(contextId);
        if (event === protocol_js_1$2.BrowsingContext.AllEvents) {
            Object.values(protocol_js_1$2.BrowsingContext.EventNames).map((specificEvent) => this.subscribe(specificEvent, contextId, channel));
            return;
        }
        if (event === protocol_js_1$2.CDP.AllEvents) {
            Object.values(protocol_js_1$2.CDP.EventNames).map((specificEvent) => this.subscribe(specificEvent, contextId, channel));
            return;
        }
        if (event === protocol_js_1$2.Log.AllEvents) {
            Object.values(protocol_js_1$2.Log.EventNames).map((specificEvent) => this.subscribe(specificEvent, contextId, channel));
            return;
        }
        if (event === protocol_js_1$2.Network.AllEvents) {
            Object.values(protocol_js_1$2.Network.EventNames).map((specificEvent) => this.subscribe(specificEvent, contextId, channel));
            return;
        }
        if (event === protocol_js_1$2.Script.AllEvents) {
            Object.values(protocol_js_1$2.Script.EventNames).map((specificEvent) => this.subscribe(specificEvent, contextId, channel));
            return;
        }
        if (!this.#channelToContextToEventMap.has(channel)) {
            this.#channelToContextToEventMap.set(channel, new Map());
        }
        const contextToEventMap = this.#channelToContextToEventMap.get(channel);
        if (!contextToEventMap.has(contextId)) {
            contextToEventMap.set(contextId, new Map());
        }
        const eventMap = contextToEventMap.get(contextId);
        // Do not re-subscribe to events to keep the priority.
        if (eventMap.has(event)) {
            return;
        }
        eventMap.set(event, this.#subscriptionPriority++);
    }
    /**
     * Unsubscribes atomically from all events in the given contexts and channel.
     */
    unsubscribeAll(events, contextIds, channel) {
        // Assert all contexts are known.
        for (const contextId of contextIds) {
            if (contextId !== null) {
                this.#browsingContextStorage.getContext(contextId);
            }
        }
        const eventContextPairs = cartesianProduct(unrollEvents(events), contextIds);
        // Assert all unsubscriptions are valid.
        // If any of the unsubscriptions are invalid, do not unsubscribe from anything.
        eventContextPairs
            .map(([event, contextId]) => this.#checkUnsubscribe(event, contextId, channel))
            .forEach((unsubscribe) => unsubscribe());
    }
    /**
     * Unsubscribes from the event in the given context and channel.
     * Syntactic sugar for "unsubscribeAll".
     */
    unsubscribe(eventName, contextId, channel) {
        this.unsubscribeAll([eventName], [contextId], channel);
    }
    #checkUnsubscribe(event, contextId, channel) {
        // All the subscriptions are handled on the top-level contexts.
        contextId = this.#browsingContextStorage.findTopLevelContextId(contextId);
        if (!this.#channelToContextToEventMap.has(channel)) {
            throw new protocol_js_1$2.Message.InvalidArgumentException(`Cannot unsubscribe from ${event}, ${contextId === null ? 'null' : contextId}. No subscription found.`);
        }
        const contextToEventMap = this.#channelToContextToEventMap.get(channel);
        if (!contextToEventMap.has(contextId)) {
            throw new protocol_js_1$2.Message.InvalidArgumentException(`Cannot unsubscribe from ${event}, ${contextId === null ? 'null' : contextId}. No subscription found.`);
        }
        const eventMap = contextToEventMap.get(contextId);
        if (!eventMap.has(event)) {
            throw new protocol_js_1$2.Message.InvalidArgumentException(`Cannot unsubscribe from ${event}, ${contextId === null ? 'null' : contextId}. No subscription found.`);
        }
        return () => {
            eventMap.delete(event);
            // Clean up maps if empty.
            if (eventMap.size === 0) {
                contextToEventMap.delete(event);
            }
            if (contextToEventMap.size === 0) {
                this.#channelToContextToEventMap.delete(channel);
            }
        };
    }
}
SubscriptionManager$1.SubscriptionManager = SubscriptionManager;

/**
 * Copyright 2022 Google LLC.
 * Copyright (c) Microsoft Corporation.
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
Object.defineProperty(EventManager$1, "__esModule", { value: true });
EventManager$1.EventManager = void 0;
const protocol_js_1$1 = protocol;
const buffer_js_1 = buffer;
const idWrapper_js_1 = idWrapper;
const OutgoingBidiMessage_js_1 = OutgoingBidiMessage$1;
const DefaultMap_js_1 = DefaultMap$1;
const SubscriptionManager_js_1 = SubscriptionManager$1;
class EventWrapper {
    #idWrapper;
    #contextId;
    #event;
    constructor(event, contextId) {
        this.#idWrapper = new idWrapper_js_1.IdWrapper();
        this.#contextId = contextId;
        this.#event = event;
    }
    get id() {
        return this.#idWrapper.id;
    }
    get contextId() {
        return this.#contextId;
    }
    get event() {
        return this.#event;
    }
}
/**
 * Maps event name to a desired buffer length.
 */
const eventBufferLength = new Map([
    [protocol_js_1$1.Log.EventNames.LogEntryAddedEvent, 100],
]);
class EventManager {
    static #NETWORK_DOMAIN_PREFIX = 'network';
    /**
     * Maps event name to a set of contexts where this event already happened.
     * Needed for getting buffered events from all the contexts in case of
     * subscripting to all contexts.
     */
    #eventToContextsMap = new DefaultMap_js_1.DefaultMap(() => new Set());
    /**
     * Maps `eventName` + `browsingContext` to buffer. Used to get buffered events
     * during subscription. Channel-agnostic.
     */
    #eventBuffers = new Map();
    /**
     * Maps `eventName` + `browsingContext` + `channel` to last sent event id.
     * Used to avoid sending duplicated events when user
     * subscribes -> unsubscribes -> subscribes.
     */
    #lastMessageSent = new Map();
    #subscriptionManager;
    #bidiServer;
    #isNetworkDomainEnabled;
    constructor(bidiServer) {
        this.#bidiServer = bidiServer;
        this.#subscriptionManager = new SubscriptionManager_js_1.SubscriptionManager(bidiServer.getBrowsingContextStorage());
        this.#isNetworkDomainEnabled = false;
    }
    get isNetworkDomainEnabled() {
        return this.#isNetworkDomainEnabled;
    }
    /**
     * Returns consistent key to be used to access value maps.
     */
    static #getMapKey(eventName, browsingContext, channel) {
        return JSON.stringify({ eventName, browsingContext, channel });
    }
    registerEvent(event, contextId) {
        this.registerPromiseEvent(Promise.resolve(event), contextId, event.method);
    }
    registerPromiseEvent(event, contextId, eventName) {
        const eventWrapper = new EventWrapper(event, contextId);
        const sortedChannels = this.#subscriptionManager.getChannelsSubscribedToEvent(eventName, contextId);
        this.#bufferEvent(eventWrapper, eventName);
        // Send events to channels in the subscription priority.
        for (const channel of sortedChannels) {
            this.#bidiServer.emitOutgoingMessage(OutgoingBidiMessage_js_1.OutgoingBidiMessage.createFromPromise(event, channel));
            this.#markEventSent(eventWrapper, channel, eventName);
        }
    }
    async subscribe(eventNames, contextIds, channel) {
        // First check if all the contexts are known.
        for (const contextId of contextIds) {
            if (contextId !== null) {
                // Assert the context is known. Throw exception otherwise.
                this.#bidiServer.getBrowsingContextStorage().getContext(contextId);
            }
        }
        for (const eventName of eventNames) {
            for (const contextId of contextIds) {
                await this.#handleDomains(eventName, contextId);
                this.#subscriptionManager.subscribe(eventName, contextId, channel);
                for (const eventWrapper of this.#getBufferedEvents(eventName, contextId, channel)) {
                    // The order of the events is important.
                    this.#bidiServer.emitOutgoingMessage(OutgoingBidiMessage_js_1.OutgoingBidiMessage.createFromPromise(eventWrapper.event, channel));
                    this.#markEventSent(eventWrapper, channel, eventName);
                }
            }
        }
    }
    /**
     * Enables domains for the subscribed event in the required contexts or
     * globally.
     */
    async #handleDomains(eventName, contextId) {
        // Enable network domain if user subscribed to any of network events.
        if (eventName.startsWith(EventManager.#NETWORK_DOMAIN_PREFIX)) {
            // Enable for all the contexts.
            if (contextId === null) {
                this.#isNetworkDomainEnabled = true;
                await Promise.all(this.#bidiServer
                    .getBrowsingContextStorage()
                    .getAllContexts()
                    .map((context) => context.cdpTarget.enableNetworkDomain()));
            }
            else {
                await this.#bidiServer
                    .getBrowsingContextStorage()
                    .getContext(contextId)
                    .cdpTarget.enableNetworkDomain();
            }
        }
    }
    unsubscribe(eventNames, contextIds, channel) {
        this.#subscriptionManager.unsubscribeAll(eventNames, contextIds, channel);
    }
    /**
     * If the event is buffer-able, put it in the buffer.
     */
    #bufferEvent(eventWrapper, eventName) {
        if (!eventBufferLength.has(eventName)) {
            // Do nothing if the event is no buffer-able.
            return;
        }
        const bufferMapKey = EventManager.#getMapKey(eventName, eventWrapper.contextId);
        if (!this.#eventBuffers.has(bufferMapKey)) {
            this.#eventBuffers.set(bufferMapKey, new buffer_js_1.Buffer(eventBufferLength.get(eventName)));
        }
        this.#eventBuffers.get(bufferMapKey).add(eventWrapper);
        // Add the context to the list of contexts having `eventName` events.
        this.#eventToContextsMap.get(eventName).add(eventWrapper.contextId);
    }
    /**
     * If the event is buffer-able, mark it as sent to the given contextId and channel.
     */
    #markEventSent(eventWrapper, channel, eventName) {
        if (!eventBufferLength.has(eventName)) {
            // Do nothing if the event is no buffer-able.
            return;
        }
        const lastSentMapKey = EventManager.#getMapKey(eventName, eventWrapper.contextId, channel);
        this.#lastMessageSent.set(lastSentMapKey, Math.max(this.#lastMessageSent.get(lastSentMapKey) ?? 0, eventWrapper.id));
    }
    /**
     * Returns events which are buffered and not yet sent to the given channel events.
     */
    #getBufferedEvents(eventName, contextId, channel) {
        const bufferMapKey = EventManager.#getMapKey(eventName, contextId);
        const lastSentMapKey = EventManager.#getMapKey(eventName, contextId, channel);
        const lastSentMessageId = this.#lastMessageSent.get(lastSentMapKey) ?? -Infinity;
        const result = this.#eventBuffers
            .get(bufferMapKey)
            ?.get()
            .filter((wrapper) => wrapper.id > lastSentMessageId) ?? [];
        if (contextId === null) {
            // For global subscriptions, events buffered in each context should be sent back.
            Array.from(this.#eventToContextsMap.get(eventName).keys())
                .filter((_contextId) => 
            // Events without context are already in the result.
            _contextId !== null &&
                // Events from deleted contexts should not be sent.
                this.#bidiServer.getBrowsingContextStorage().hasContext(_contextId))
                .map((_contextId) => this.#getBufferedEvents(eventName, _contextId, channel))
                .forEach((events) => result.push(...events));
        }
        return result.sort((e1, e2) => e1.id - e2.id);
    }
}
EventManager$1.EventManager = EventManager;

var realmStorage = {};

Object.defineProperty(realmStorage, "__esModule", { value: true });
realmStorage.RealmStorage = void 0;
const protocol_js_1 = protocol;
class RealmStorage {
    /** Tracks handles and their realms sent to the client. */
    #knownHandlesToRealm = new Map();
    /** Map from realm ID to Realm. */
    #realmMap = new Map();
    get knownHandlesToRealm() {
        return this.#knownHandlesToRealm;
    }
    get realmMap() {
        return this.#realmMap;
    }
    findRealms(filter) {
        return Array.from(this.#realmMap.values()).filter((realm) => {
            if (filter.realmId !== undefined && filter.realmId !== realm.realmId) {
                return false;
            }
            if (filter.browsingContextId !== undefined &&
                filter.browsingContextId !== realm.browsingContextId) {
                return false;
            }
            if (filter.navigableId !== undefined &&
                filter.navigableId !== realm.navigableId) {
                return false;
            }
            if (filter.executionContextId !== undefined &&
                filter.executionContextId !== realm.executionContextId) {
                return false;
            }
            if (filter.origin !== undefined && filter.origin !== realm.origin) {
                return false;
            }
            if (filter.type !== undefined && filter.type !== realm.type) {
                return false;
            }
            if (filter.sandbox !== undefined && filter.sandbox !== realm.sandbox) {
                return false;
            }
            if (filter.cdpSessionId !== undefined &&
                filter.cdpSessionId !== realm.cdpSessionId) {
                return false;
            }
            return true;
        });
    }
    findRealm(filter) {
        const maybeRealms = this.findRealms(filter);
        if (maybeRealms.length !== 1) {
            return undefined;
        }
        return maybeRealms[0];
    }
    getRealm(filter) {
        const maybeRealm = this.findRealm(filter);
        if (maybeRealm === undefined) {
            throw new protocol_js_1.Message.NoSuchFrameException(`Realm ${JSON.stringify(filter)} not found`);
        }
        return maybeRealm;
    }
    deleteRealms(filter) {
        this.findRealms(filter).map((realm) => {
            this.#realmMap.delete(realm.realmId);
            Array.from(this.#knownHandlesToRealm.entries())
                .filter(([, r]) => r === realm.realmId)
                .map(([h]) => this.#knownHandlesToRealm.delete(h));
        });
    }
}
realmStorage.RealmStorage = RealmStorage;

/**
 * Copyright 2021 Google LLC.
 * Copyright (c) Microsoft Corporation.
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
Object.defineProperty(BidiServer$1, "__esModule", { value: true });
BidiServer$1.BidiServer = void 0;
const EventEmitter_js_1 = EventEmitter$1;
const processingQueue_js_1 = processingQueue;
const CommandProcessor_js_1 = CommandProcessor$1;
const browsingContextStorage_js_1 = browsingContextStorage;
const EventManager_js_1 = EventManager$1;
const realmStorage_js_1 = realmStorage;
class BidiServer extends EventEmitter_js_1.EventEmitter {
    #messageQueue;
    #transport;
    #commandProcessor;
    #browsingContextStorage;
    #realmStorage;
    #logger;
    #handleIncomingMessage = (message) => {
        this.#commandProcessor.processCommand(message);
    };
    #processOutgoingMessage = async (messageEntry) => {
        const message = messageEntry.message;
        if (messageEntry.channel !== null) {
            message['channel'] = messageEntry.channel;
        }
        await this.#transport.sendMessage(message);
    };
    constructor(bidiTransport, cdpConnection, selfTargetId, parser, logger) {
        super();
        this.#logger = logger;
        this.#browsingContextStorage = new browsingContextStorage_js_1.BrowsingContextStorage();
        this.#realmStorage = new realmStorage_js_1.RealmStorage();
        this.#messageQueue = new processingQueue_js_1.ProcessingQueue(this.#processOutgoingMessage, () => Promise.resolve(), this.#logger);
        this.#transport = bidiTransport;
        this.#transport.setOnMessage(this.#handleIncomingMessage);
        this.#commandProcessor = new CommandProcessor_js_1.CommandProcessor(this.#realmStorage, cdpConnection, new EventManager_js_1.EventManager(this), selfTargetId, parser, this.#browsingContextStorage, this.#logger);
        this.#commandProcessor.on('response', (response) => {
            this.emitOutgoingMessage(response);
        });
    }
    static async createAndStart(bidiTransport, cdpConnection, selfTargetId, parser, logger) {
        const server = new BidiServer(bidiTransport, cdpConnection, selfTargetId, parser, logger);
        const cdpClient = cdpConnection.browserClient();
        // Needed to get events about new targets.
        await cdpClient.sendCommand('Target.setDiscoverTargets', { discover: true });
        // Needed to automatically attach to new targets.
        await cdpClient.sendCommand('Target.setAutoAttach', {
            autoAttach: true,
            waitForDebuggerOnStart: true,
            flatten: true,
        });
        await server.topLevelContextsLoaded();
        return server;
    }
    async topLevelContextsLoaded() {
        await Promise.all(this.#browsingContextStorage
            .getTopLevelContexts()
            .map((c) => c.awaitLoaded()));
    }
    /**
     * Sends BiDi message.
     */
    emitOutgoingMessage(messageEntry) {
        this.#messageQueue.add(messageEntry);
    }
    close() {
        this.#transport.close();
    }
    getBrowsingContextStorage() {
        return this.#browsingContextStorage;
    }
}
BidiServer$1.BidiServer = BidiServer;

(function (exports) {
	/**
	 * Copyright 2022 Google LLC.
	 * Copyright (c) Microsoft Corporation.
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
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.EventEmitter = exports.BidiServer = void 0;
	var BidiServer_js_1 = BidiServer$1;
	Object.defineProperty(exports, "BidiServer", { enumerable: true, get: function () { return BidiServer_js_1.BidiServer; } });
	var EventEmitter_js_1 = EventEmitter$1;
	Object.defineProperty(exports, "EventEmitter", { enumerable: true, get: function () { return EventEmitter_js_1.EventEmitter; } });
	
} (bidiMapper));

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
    const bidiServer = await bidiMapper.BidiServer.createAndStart(transportBiDi, cdpConnectionAdapter, '');
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
class CDPClientAdapter extends bidiMapper.EventEmitter {
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
}
_CDPClientAdapter_closed = new WeakMap(), _CDPClientAdapter_client = new WeakMap(), _CDPClientAdapter_forwardMessage = new WeakMap();
/**
 * This transport is given to the BiDi server instance and allows Puppeteer
 * to send and receive commands to the BiDiServer.
 * @internal
 */
class NoOpTransport extends bidiMapper.EventEmitter {
    constructor() {
        super(...arguments);
        _NoOpTransport_onMessage.set(this, async (_m) => {
            return;
        });
    }
    emitMessage(message) {
        __classPrivateFieldGet(this, _NoOpTransport_onMessage, "f").call(this, message);
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
