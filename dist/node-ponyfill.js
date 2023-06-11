'use strict';

var index = require('./index.js');
var vm2_bridge = require('./vm2/bridge.js');

function _mergeNamespaces(n, m) {
  m.forEach(function (e) {
    e && typeof e !== 'string' && !Array.isArray(e) && Object.keys(e).forEach(function (k) {
      if (k !== 'default' && !(k in n)) {
        var d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: function () { return e[k]; }
        });
      }
    });
  });
  return Object.freeze(n);
}

var nodePonyfill$1 = {exports: {}};

var require$$0 = /*@__PURE__*/vm2_bridge.getAugmentedNamespace(index.lib);

(function (module, exports) {
	const nodeFetch = require$$0;
	const realFetch = nodeFetch.default || nodeFetch;

	const fetch = function (url, options) {
	  // Support schemaless URIs on the server for parity with the browser.
	  // Ex: //github.com/ -> https://github.com/
	  if (/^\/\//.test(url)) {
	    url = 'https:' + url;
	  }
	  return realFetch.call(this, url, options)
	};

	fetch.ponyfill = true;

	module.exports = exports = fetch;
	exports.fetch = fetch;
	exports.Headers = nodeFetch.Headers;
	exports.Request = nodeFetch.Request;
	exports.Response = nodeFetch.Response;

	// Needed for TypeScript consumers without esModuleInterop.
	exports.default = fetch; 
} (nodePonyfill$1, nodePonyfill$1.exports));

var nodePonyfillExports = nodePonyfill$1.exports;

var nodePonyfill = /*#__PURE__*/_mergeNamespaces({
  __proto__: null
}, [nodePonyfillExports]);

exports.nodePonyfill = nodePonyfill;
