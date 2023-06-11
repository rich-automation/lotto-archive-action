'use strict';

var vm2_main = require('./main.js');

if (parseInt(process.versions.node.split('.')[0]) < 6) throw new Error('vm2 requires Node.js version 6 or newer.');

var vm2 = vm2_main.main;

exports.vm2 = vm2;
