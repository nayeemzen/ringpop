// Copyright (c) 2015 Uber Technologies, Inc.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.
'use strict';

// 3rd party dependencies
var _ = require('underscore');
var DebuglogLogger = require('debug-logtron');
var EventEmitter = require('events').EventEmitter;
var tape = require('tape');

// 1st party dependencies
var Ringpop = require('../../index.js');
var TChannel = require('tchannel');

var CONVERGENCE_TIMER_INTERVAL = 50;

function bootstrapClusterOf(opts, onBootstrap) {
    var cluster = createClusterOf(opts);
    var nodes = cluster.nodes;

    var bootstrapHosts = nodes.map(function mapRingpop(ringpop) {
        return ringpop.hostPort;
    });

    if (typeof opts.tap === 'function') {
        opts.tap(cluster);
    }

    var count = 0;
    var results = {};

    function bootstrapHandler(hostPort) {
        return function bootstrapIt(err, nodesJoined) {
            results[hostPort] = {
                err: err,
                nodesJoined: nodesJoined
            };

            if (++count === nodes.length) {
                onBootstrap(results);
            }
        };
    }

    for (var i = 0; i < nodes.length; i++) {
        var ringpop = nodes[i];

        ringpop.bootstrap({
            bootstrapFile: bootstrapHosts
        }, Array.isArray(onBootstrap) ?
            onBootstrap[i] : bootstrapHandler(ringpop.hostPort));
    }

    return cluster;
}

function checkConvergence(cluster) {
    var nonFaultyNodes = getNonFaultyNodes(cluster);
    var areAllSameChecksum = true;
    var lastChecksum;

    for (var i = 0; i < nonFaultyNodes.length; i++) {
        var ringpop = nonFaultyNodes[i];
        var checksum = ringpop.membership.checksum;

        if (lastChecksum && lastChecksum !== checksum) {
            areAllSameChecksum = false;
            break;
        }

        lastChecksum = checksum;
    }

    if (areAllSameChecksum) {
        return true;
    }

    return false;
}

function getNonFaultyNodes(cluster) {
    var nonFaultyNodes = {};

    for (var i = 0; i < cluster.nodes.length; i++) {
        var ringpop = cluster.nodes[i];
        var members = ringpop.membership.members;

        for (var j = 0; j < members.length; j++) {
            var member = members[i];

            if (member.status !== 'faulty') {
                nonFaultyNodes[member.address] = cluster.findRingpopByAddress(member.address);
            }
        }
    }

    return Object.keys(nonFaultyNodes).map(function mapNodeKey(node) {
        return nonFaultyNodes[node];
    });
}

function createClusterOf(opts) {
    var size = opts.size || 3;

    var cluster = Object.create(EventEmitter.prototype);
    var nodes = [];

    for (var i = 0; i < size; i++) {
        nodes.push(createRingpop(_.extend({
            host: '127.0.0.1',
            port: 10000 + i
        }, opts)));
    }

    cluster.findRingpopByAddress = function findRingpopByAddress(address) {
        for (var i = 0; i < cluster.nodes.length; i++) {
            var ringpop = cluster.nodes[i];

            if (ringpop.hostPort === address) {
                return ringpop;
            }
            console.log('ringpop.hostPort: ' + ringpop.hostPort + ', address: ' + address);
        }

        return null;
    }

    cluster.nodes = nodes;

    return cluster;
}

function createTChannel(host, port) {
    return new TChannel({
        host: host,
        port: port
    });
}

function createRingpop(opts) {
    opts = opts || {};

    var ringpop = new Ringpop(_.extend({
        app: 'test',
        hostPort: opts.host + ':' + opts.port,
        maxJoinDuration: opts.maxJoinDuration,
        channel: createTChannel(opts.host, opts.port),
        logger: DebuglogLogger('ringpop')
    }, opts));

    ringpop.setupChannel();

    return ringpop;
}

function destroyCluster(cluster) {
    cluster.nodes.forEach(function eachRingpop(ringpop) {
        ringpop.destroy();
    });
}

function testRingpopCluster(opts, name, test) {
    if (typeof opts === 'string' && typeof name === 'function') {
        test = name;
        name = opts;
        opts = {};
    }

    tape(name, function onTest(assert) {
        var cluster = bootstrapClusterOf(opts, function onBootstrap(results) {
            monitorConvergence(cluster);

            assert.on('end', function onEnd() {
                destroyCluster(cluster);
            });

            test(results, cluster, assert);
        });
    });

    function monitorConvergence(cluster) {
        var checksums = {};

        cluster.nodes.forEach(function eachNode(ringpop) {
            ringpop.on('membershipChanged', function onUpdated() {
                if (checkConvergence(cluster)) {
                    cluster.emit('converged');
                }
            });
        });
    }
}

module.exports = testRingpopCluster;
