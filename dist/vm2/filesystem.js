'use strict';

var path = require('path');
var fs$1 = require('fs');

var filesystem = {};

const pa = path;
const fs = fs$1;

class DefaultFileSystem {

	resolve(path) {
		return pa.resolve(path);
	}

	isSeparator(char) {
		return char === '/' || char === pa.sep;
	}

	isAbsolute(path) {
		return pa.isAbsolute(path);
	}

	join(...paths) {
		return pa.join(...paths);
	}

	basename(path) {
		return pa.basename(path);
	}

	dirname(path) {
		return pa.dirname(path);
	}

	statSync(path, options) {
		return fs.statSync(path, options);
	}

	readFileSync(path, options) {
		return fs.readFileSync(path, options);
	}

}

class VMFileSystem {

	constructor({fs: fsModule = fs, path: pathModule = pa} = {}) {
		this.fs = fsModule;
		this.path = pathModule;
	}

	resolve(path) {
		return this.path.resolve(path);
	}

	isSeparator(char) {
		return char === '/' || char === this.path.sep;
	}

	isAbsolute(path) {
		return this.path.isAbsolute(path);
	}

	join(...paths) {
		return this.path.join(...paths);
	}

	basename(path) {
		return this.path.basename(path);
	}

	dirname(path) {
		return this.path.dirname(path);
	}

	statSync(path, options) {
		return this.fs.statSync(path, options);
	}

	readFileSync(path, options) {
		return this.fs.readFileSync(path, options);
	}

}

filesystem.DefaultFileSystem = DefaultFileSystem;
filesystem.VMFileSystem = VMFileSystem;

exports.filesystem = filesystem;
