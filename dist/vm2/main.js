'use strict';

var vm2_bridge = require('./bridge.js');
var vm2_script = require('./script.js');
var vm2_vm = require('./vm.js');
var vm2_nodevm = require('./nodevm.js');
var vm2_filesystem = require('./filesystem.js');
var vm2_resolver = require('./resolver.js');
var vm2_resolverCompat = require('./resolver-compat.js');

var main = {};

const {
	VMError
} = vm2_bridge.bridge;
const {
	VMScript
} = vm2_script.script;
const {
	VM
} = vm2_vm.vm;
const {
	NodeVM
} = vm2_nodevm.nodevm;
const {
	VMFileSystem
} = vm2_filesystem.filesystem;
const {
	Resolver
} = vm2_resolver.resolver;
const {
	makeResolverFromLegacyOptions
} = vm2_resolverCompat.resolverCompat;

main.VMError = VMError;
main.VMScript = VMScript;
main.NodeVM = NodeVM;
main.VM = VM;
main.VMFileSystem = VMFileSystem;
main.Resolver = Resolver;
main.makeResolverFromLegacyOptions = makeResolverFromLegacyOptions;

exports.main = main;
