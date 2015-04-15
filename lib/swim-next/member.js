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

function Member(opts) {
    this.meta = opts.meta;
    this.address = opts.address;
    this.state = opts.state || Member.State.Alive;
    this.incarnationNumber = opts.incarnationNumber || 0;
}

Member.prototype.data = function data() {
    return {
        meta: this.meta,
        address: this.address,
        state: this.state,
        incarnation: this.incarnation
    };
};

Member.prototype.bumpIncarnationNumber = function bumpIncarnationNumber(data, force) {
    if (!data) {
        this.incarnationNumber += 1;
        return true;
    }

    if (data.incarnationNumber > this.incarnationNumber) {
        if (this.incarnationNumber === 0) {
            this.meta = data.meta;
        }
        this.incarnationNumber = data.incarnationNumber + 1;
        return true;
    }

    if (data.incarnationNumber === this.incarnationNumber && force) {
        this.incarnationNumber = data.incarnationNumber + 1;
        return true;
    }

    return false;
};

Member.State = {
    Alive: 1,
    Suspect: 2,
    Faulty: 3
};

module.exports = Member;
