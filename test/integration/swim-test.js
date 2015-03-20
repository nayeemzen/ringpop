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

var sendPingReq = require('../../lib/swim/ping-req-sender.js');
var testRingpopCluster = require('../lib/test-ringpop-cluster.js');

// Test helpers
function assertNumBadStatuses(assert, res, num) {
    var badStatuses = res.pingReqErrs.filter(function filterErr(err) {
        return err.type === 'ringpop.ping-req.bad-ping-status';
    });

    assert.equals(badStatuses.length, num, 'correct number of bad statuses');
}

function mkBadPingResponder(ringpop) {
    ringpop.channel.register('/protocol/ping', function protocolPing(arg1, arg2, hostInfo, cb) {
        cb(null, null, JSON.stringify('badbody'));
    });
}

function mkBadPingReqResponder(ringpop) {
    ringpop.channel.register('/protocol/ping-req', function protocolPingReq(arg1, arg2, hostInfo, cb) {
        cb(null, null, JSON.stringify('badbody'));
    });
}

function mkNoGossip(cluster) {
    var noop = function noop() {
    };

    cluster.nodes.forEach(function eachRingpop(ringpop) {
        ringpop.gossip.start = noop;
    });
}

testRingpopCluster({
    tap: function tap(cluster) {
        mkNoGossip(cluster);
    }
}, 'ping-reqs 1 member', function t(bootRes, cluster, assert) {
    var ringpop = cluster.nodes[0];
    var unreachableMember = ringpop.membership.findMemberByAddress(cluster.nodes[1].hostPort);

    sendPingReq({
        ringpop: cluster.nodes[0],
        unreachableMember: unreachableMember,
        pingReqSize: 3
    }, function onPingReq(err, res) {
        assert.ifErr(err, 'no error occurred');
        assert.equal(res.pingReqAddrs.length, 1,
            'number of selected ping-req members is correct');
        assert.ok(res.pingReqSuccess.address === cluster.nodes[2].hostPort,
            'successful ping-req response from either member');
        assert.end();
    });
});

testRingpopCluster({
    size: 5,
    tap: function tap(cluster) {
        mkNoGossip(cluster);
    }
}, 'ping-reqs pingReqSize members', function t(bootRes, cluster, assert) {
    var ringpop = cluster.nodes[0];
    var unreachableMember = ringpop.membership.
        findMemberByAddress(cluster.nodes[1].hostPort);
    var pingReqSize = 3;

    sendPingReq({
        ringpop: cluster.nodes[0],
        unreachableMember: unreachableMember,
        pingReqSize: pingReqSize
    }, function onPingReq(err, res) {
        assert.ifErr(err, 'no error occurred');
        assert.equal(res.pingReqAddrs.length, pingReqSize,
            'number of selected ping-req members is correct');
        assert.equal(unreachableMember.status, 'alive',
            'unreachable member is alive');
        assert.end();
    });
});

testRingpopCluster({
    size: 5,
    tap: function tap(cluster) {
        mkNoGossip(cluster);
    }
}, 'ping-req target unreachable', function t(bootRes, cluster, assert) {
    var badRingpop = cluster.nodes[4];
    badRingpop.destroy();

    var ringpop = cluster.nodes[0];
    var unreachableMember = ringpop.membership.findMemberByAddress(badRingpop.hostPort);
    var pingReqSize = 3;

    sendPingReq({
        ringpop: ringpop,
        unreachableMember: unreachableMember,
        pingReqSize: pingReqSize
    }, function onPingReq(err, res) {
        assert.ifErr(err, 'no error occurred');
        assertNumBadStatuses(assert, res, pingReqSize);
        assert.equals(unreachableMember.status, 'suspect',
            'unreachable member is suspect');
        assert.end();
    });
});

testRingpopCluster({
    size: 2,
    tap: function tap(cluster) {
        mkNoGossip(cluster);
    }
}, 'no ping-req members', function t(bootRes, cluster, assert) {
    var ringpop = cluster.nodes[0];
    var ringpop2Addr = cluster.nodes[1].hostPort;

    var unreachableMember = ringpop.membership.findMemberByAddress(ringpop2Addr);
    var pingReqSize = 3;

    sendPingReq({
        ringpop: ringpop,
        unreachableMember: unreachableMember,
        pingReqSize: pingReqSize
    }, function onPingReq(err, res) {
        assert.ok(err, 'error occurred');
        assert.equals(err.type, 'ringpop.ping-req.no-members', 'No members error');
        assert.end();
    });
});

testRingpopCluster({
    size: 5,
    tap: function tap(cluster) {
        mkBadPingReqResponder(cluster.nodes[3]);
        mkNoGossip(cluster);
    }
}, 'some bad ping-statuses', function t(bootRes, cluster, assert) {
    var badRingpop = cluster.nodes[4];
    badRingpop.destroy();

    var ringpop = cluster.nodes[0];
    var unreachableMember = ringpop.membership.findMemberByAddress(badRingpop.hostPort);
    var pingReqSize = 3;

    sendPingReq({
        ringpop: ringpop,
        unreachableMember: unreachableMember,
        pingReqSize: pingReqSize
    }, function onPingReq(err, res) {
        assert.ifErr(err, 'no error occurred');
        assertNumBadStatuses(assert, res, pingReqSize - 1);
        assert.equals(unreachableMember.status, 'suspect',
            'unreachable member is suspect');
        assert.end();
    });
});

testRingpopCluster({
    size: 5,
    tap: function tap(cluster) {
        mkNoGossip(cluster);
    }
}, 'ping-req inconclusive', function t(bootRes, cluster, assert) {
    var ringpop = cluster.nodes[0];
    var unreachableMember = ringpop.membership.findMemberByAddress(cluster.nodes[4].hostPort);
    var pingReqSize = 3;

    ringpop.membership.members.forEach(function eachMember(member) {
        member.address += '001';
    });

    sendPingReq({
        ringpop: ringpop,
        unreachableMember: unreachableMember,
        pingReqSize: pingReqSize
    }, function onPingReq(err) {
        assert.ok(err, 'an error occurred');
        assert.equal(err.type, 'ringpop.ping-req.inconclusive',
            'ping-req is inconclusive');
        assert.equals(unreachableMember.status, 'alive',
            'unreachable member is alive');
        assert.end();
    });
});

testRingpopCluster('cluster converges on faulty member', function t(bootRes, cluster, assert) {
    var badRingpop = cluster.nodes[2];
    var badAddr = badRingpop.hostPort;

    function assertSuspectConvergence() {
        cluster.once('converged', function onConverged() {
            var agree = cluster.nodes.filter(function filterNode(ringpop) {
                return ringpop.membership.findMemberByAddress(badAddr).status === 'suspect';
            });

            assert.equal(agree.length, 2, 'converge on suspect');
            assertFaultyConvergence();
        });
    }

    function assertFaultyConvergence() {
        cluster.once('converged', function onConverged() {
            var agree = cluster.nodes.filter(function filterNode(ringpop) {
                return ringpop.hostPort !== badAddr &&
                    ringpop.membership.findMemberByAddress(badAddr).status === 'faulty';
            });

            assert.equal(agree.length, 2, 'converge on faulty');
            assert.end();
        });
    }

    assertSuspectConvergence();

    // Stop gossip so that it doesn't reassert itself as alive
    badRingpop.gossip.stop();

    // Have badRingpop cause ping errors so that it eventually
    // becomes faulty.
    mkBadPingResponder(badRingpop);
});
