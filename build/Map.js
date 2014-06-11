var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
var Iterable = require('./Iterable');

function invariant(condition, error) {
    if (!condition)
        throw new Error(error);
}

var Map = (function (_super) {
    __extends(Map, _super);
    // @pragma Construction
    function Map(obj) {
        _super.call(this, this);
        return Map.fromObj(obj);
    }
    Map.empty = function () {
        return __EMPTY_MAP || (__EMPTY_MAP = Map._make(0));
    };

    Map.fromObj = function (obj) {
        var map = Map.empty().asTransient();
        for (var k in obj)
            if (obj.hasOwnProperty(k)) {
                map.set(k, obj[k]);
            }
        return map.asPersistent();
    };

    Map.prototype.has = function (k) {
        if (k == null || this._root == null) {
            return false;
        }
        return this._root.get(0, hashValue(k), k, __SENTINEL) !== __SENTINEL;
    };

    Map.prototype.get = function (k) {
        if (k != null && this._root) {
            return this._root.get(0, hashValue(k), k);
        }
    };

    // @pragma Modification
    Map.prototype.set = function (k, v) {
        if (k == null) {
            return this;
        }
        var didAddLeaf = new BoolRef();
        var newRoot = this._root || __EMPTY_MNODE;
        if (this._editRef) {
            this._root = newRoot.setTransient(this._editRef, 0, hashValue(k), k, v, didAddLeaf);
            if (didAddLeaf.val) {
                this.length++;
            }
            return this;
        } else {
            newRoot = newRoot.set(0, hashValue(k), k, v, didAddLeaf);
            return newRoot === this._root ? this : Map._make(this.length + (didAddLeaf.val ? 1 : 0), newRoot);
        }
    };

    Map.prototype.delete = function (k) {
        if (k == null || this._root == null) {
            return this;
        }
        if (this._editRef) {
            var didRemoveLeaf = new BoolRef();
            this._root = this._root.deleteTransient(this._editRef, 0, hashValue(k), k, didRemoveLeaf);
            if (didRemoveLeaf.val) {
                this.length--;
            }
            return this;
        } else {
            var newRoot = this._root.delete(0, hashValue(k), k);
            return newRoot === this._root ? this : newRoot ? Map._make(this.length - 1, newRoot) : Map.empty();
        }
    };

    Map.prototype.merge = function (map) {
        var newMap = this.asTransient();
        map.iterate(function (value, key) {
            return newMap.set(key, value);
        });
        return newMap.asPersistent();
    };

    // @pragma Mutability
    Map.prototype.isTransient = function () {
        return !!this._editRef;
    };

    Map.prototype.asTransient = function () {
        return this._editRef ? this : Map._make(this.length, this._root, new EditRef());
    };

    Map.prototype.asPersistent = function () {
        this._editRef = null;
        return this;
    };

    // @pragma Iteration
    Map.prototype.iterate = function (fn, thisArg) {
        return this._root && this._root.iterate(this, fn, thisArg);
    };

    Map._make = function (length, root, editRef) {
        var map = Object.create(Map.prototype);
        map.length = length;
        map._root = root;
        map._editRef = editRef;
        return map;
    };
    return Map;
})(Iterable);
exports.Map = Map;

var EditRef = (function () {
    function EditRef() {
    }
    return EditRef;
})();

var BoolRef = (function () {
    function BoolRef(val) {
        this.val = val;
    }
    return BoolRef;
})();

var BitmapIndexedNode = (function () {
    function BitmapIndexedNode(editRef, bitmap, arr) {
        this.editRef = editRef;
        this.bitmap = bitmap;
        this.arr = arr;
    }
    BitmapIndexedNode.prototype.get = function (shift, hash, key, not_found) {
        var bit = 1 << ((hash >>> shift) & MASK);
        if ((this.bitmap & bit) === 0) {
            return not_found;
        }
        var idx = bitmap_indexed_node_index(this.bitmap, bit);
        var key_or_nil = this.arr[2 * idx];
        var val_or_node = this.arr[2 * idx + 1];
        if (key_or_nil == null) {
            return val_or_node.get(shift + SHIFT, hash, key, not_found);
        }
        return key === key_or_nil ? val_or_node : not_found;
    };

    BitmapIndexedNode.prototype.delete = function (shift, hash, key) {
        var bit = 1 << ((hash >>> shift) & MASK);
        if ((this.bitmap & bit) === 0) {
            return this;
        }
        var idx = bitmap_indexed_node_index(this.bitmap, bit);
        var key_or_nil = this.arr[2 * idx];
        var val_or_node = this.arr[2 * idx + 1];
        if (key_or_nil == null) {
            var n = val_or_node.delete(shift + SHIFT, hash, key);
            if (n === val_or_node) {
                return this;
            }
            if (n != null) {
                return new BitmapIndexedNode(null, this.bitmap, clone_and_set(this.arr, 2 * idx + 1, n));
            }
            if (this.bitmap === bit) {
                return null;
            }
            return new BitmapIndexedNode(null, this.bitmap ^ bit, remove_pair(this.arr, idx));
        }
        return key === key_or_nil ? new BitmapIndexedNode(null, this.bitmap ^ bit, remove_pair(this.arr, idx)) : this;
    };

    BitmapIndexedNode.prototype.deleteTransient = function (editRef, shift, hash, key, didRemoveLeaf) {
        var bit = 1 << ((hash >>> shift) & MASK);
        if ((this.bitmap & bit) === 0) {
            return this;
        }
        var idx = bitmap_indexed_node_index(this.bitmap, bit);
        var key_or_nil = this.arr[2 * idx];
        var val_or_node = this.arr[2 * idx + 1];
        if (key_or_nil == null) {
            var n = val_or_node.deleteTransient(editRef, shift + SHIFT, hash, key, didRemoveLeaf);
            if (n === val_or_node) {
                return this;
            }
            if (n != null) {
                return edit_and_set(this, editRef, 2 * idx + 1, n);
            }
            if (this.bitmap === bit) {
                return null;
            }
            return edit_and_remove_pair(this, editRef, bit, idx);
        }
        if (key === key_or_nil) {
            didRemoveLeaf.val = true;
            return edit_and_remove_pair(this, editRef, bit, idx);
        }
        return this;
    };

    BitmapIndexedNode.prototype.set = function (shift, hash, key, val, didAddLeaf) {
        var bit = 1 << ((hash >>> shift) & MASK);
        var idx = bitmap_indexed_node_index(this.bitmap, bit);
        if ((this.bitmap & bit) === 0) {
            var n = bit_count(this.bitmap);
            if (n >= 16) {
                var nodes = new Array(SIZE);
                var jdx = (hash >>> shift) & MASK;
                nodes[jdx] = __EMPTY_MNODE.set(shift + SHIFT, hash, key, val, didAddLeaf);
                var kvi = 0;
                for (var ii = 0; ii < SIZE; ii++) {
                    if (((this.bitmap >>> ii) & 1) === 1) {
                        nodes[ii] = this.arr[kvi] != null ? __EMPTY_MNODE.set(shift + SHIFT, hashValue(this.arr[kvi]), this.arr[kvi], this.arr[kvi + 1], didAddLeaf) : this.arr[kvi + 1];
                        kvi += 2;
                    }
                }
                return new ArrayNode(null, n + 1, nodes);
            }
            var newArr = this.arr.slice();
            if (newArr.length == 2 * idx) {
                newArr.push(key, val);
            } else {
                newArr.splice(2 * idx, 0, key, val);
            }
            didAddLeaf && (didAddLeaf.val = true);
            return new BitmapIndexedNode(null, this.bitmap | bit, newArr);
        }
        var key_or_nil = this.arr[2 * idx];
        var val_or_node = this.arr[2 * idx + 1];
        var newNode;
        if (key_or_nil == null) {
            newNode = val_or_node.set(shift + SHIFT, hash, key, val, didAddLeaf);
            if (newNode === val_or_node) {
                return this;
            }
            return new BitmapIndexedNode(null, this.bitmap, clone_and_set(this.arr, 2 * idx + 1, newNode));
        }
        if (key === key_or_nil) {
            if (val === val_or_node) {
                return this;
            }
            return new BitmapIndexedNode(null, this.bitmap, clone_and_set(this.arr, 2 * idx + 1, val));
        }
        didAddLeaf && (didAddLeaf.val = true);
        var key1hash = hashValue(key_or_nil);
        if (key1hash === hash) {
            newNode = new HashCollisionNode(null, key1hash, 2, [key_or_nil, val_or_node, key, val]);
        } else {
            // TODO, setTransient?
            newNode = __EMPTY_MNODE.set(shift, key1hash, key_or_nil, val_or_node).set(shift, hash, key, val);
        }
        return new BitmapIndexedNode(null, this.bitmap, clone_and_set(this.arr, 2 * idx, null, 2 * idx + 1, newNode));
    };

    BitmapIndexedNode.prototype.setTransient = function (editRef, shift, hash, key, val, didAddLeaf) {
        var bit = 1 << ((hash >>> shift) & MASK);
        var idx = bitmap_indexed_node_index(this.bitmap, bit);
        if ((this.bitmap & bit) === 0) {
            var n = bit_count(this.bitmap);
            if (n >= 16) {
                var nodes = new Array(SIZE);
                var jdx = (hash >>> shift) & MASK;
                nodes[jdx] = __EMPTY_MNODE.setTransient(editRef, shift + SHIFT, hash, key, val, didAddLeaf);
                var kvi = 0;
                for (var ii = 0; ii < SIZE; ii++) {
                    if (((this.bitmap >>> ii) & 1) === 1) {
                        nodes[ii] = this.arr[kvi] != null ? __EMPTY_MNODE.setTransient(editRef, shift + SHIFT, hashValue(this.arr[kvi]), this.arr[kvi], this.arr[kvi + 1], didAddLeaf) : this.arr[kvi + 1];
                        kvi += 2;
                    }
                }
                return new ArrayNode(editRef, n + 1, nodes);
            }
            var editable = this.ensureEditable(editRef);
            if (editable.arr.length == 2 * idx) {
                editable.arr.push(key, val);
            } else {
                editable.arr.splice(2 * idx, 0, key, val);
            }
            editable.bitmap |= bit;
            didAddLeaf && (didAddLeaf.val = true);
            return editable;
        }
        var key_or_nil = this.arr[2 * idx];
        var val_or_node = this.arr[2 * idx + 1];
        var newNode;
        if (key_or_nil == null) {
            newNode = val_or_node.setTransient(editRef, shift + SHIFT, hash, key, val, didAddLeaf);
            if (newNode === val_or_node) {
                return this;
            }
            return edit_and_set(this, editRef, 2 * idx + 1, newNode);
        }
        if (key === key_or_nil) {
            if (val === val_or_node) {
                return this;
            }
            return edit_and_set(this, editRef, 2 * idx + 1, val);
        }
        var key1hash = hashValue(key_or_nil);
        if (key1hash === hash) {
            newNode = new HashCollisionNode(editRef, key1hash, 2, [key_or_nil, val_or_node, key, val]);
        } else {
            newNode = __EMPTY_MNODE.setTransient(editRef, shift + SHIFT, key1hash, key_or_nil, val_or_node).setTransient(editRef, shift + SHIFT, hash, key, val);
        }
        didAddLeaf && (didAddLeaf.val = true);
        return edit_and_set(this, editRef, 2 * idx, null, 2 * idx + 1, newNode);
    };

    BitmapIndexedNode.prototype.ensureEditable = function (editRef) {
        if (editRef && editRef === this.editRef) {
            return this;
        }
        return new BitmapIndexedNode(editRef, this.bitmap, this.arr.slice());
    };

    BitmapIndexedNode.prototype.iterate = function (map, fn, thisArg) {
        return mNodeIterate(map, this.arr, fn, thisArg);
    };
    return BitmapIndexedNode;
})();

var ArrayNode = (function () {
    function ArrayNode(editRef, cnt, arr) {
        this.editRef = editRef;
        this.cnt = cnt;
        this.arr = arr;
    }
    ArrayNode.prototype.get = function (shift, hash, key, not_found) {
        var idx = (hash >>> shift) & MASK;
        return this.arr[idx] ? this.arr[idx].get(shift + SHIFT, hash, key, not_found) : not_found;
    };

    ArrayNode.prototype.delete = function (shift, hash, key) {
        var idx = (hash >>> shift) & MASK;
        var node = this.arr[idx];
        if (node == null) {
            return this;
        }
        var n = node.delete(shift + SHIFT, hash, key);
        if (n === node) {
            return this;
        }
        if (n == null) {
            if (this.cnt <= 8) {
                return pack_array_node(this, null, idx);
            }
            return new ArrayNode(null, this.cnt - 1, clone_and_set(this.arr, idx, n));
        }
        return new ArrayNode(null, this.cnt, clone_and_set(this.arr, idx, n));
    };

    ArrayNode.prototype.deleteTransient = function (editRef, shift, hash, key, didRemoveLeaf) {
        var idx = (hash >>> shift) & MASK;
        var node = this.arr[idx];
        if (node == null) {
            return this;
        }
        var n = node.deleteTransient(editRef, shift + SHIFT, hash, key, didRemoveLeaf);
        if (n === node) {
            return this;
        }
        if (n == null) {
            if (this.cnt <= 8) {
                return pack_array_node(this, editRef, idx);
            }
            var editable = this.ensureEditable(editRef);
            editable.arr[idx] = n;
            editable.cnt--;
            return editable;
        }
        return edit_and_set(this, editRef, idx, n);
    };

    ArrayNode.prototype.set = function (shift, hash, key, val, didAddLeaf) {
        var idx = (hash >>> shift) & MASK;
        var node = this.arr[idx];
        var newNode = (node || __EMPTY_MNODE).set(shift + SHIFT, hash, key, val, didAddLeaf);
        if (newNode === node) {
            return this;
        }
        var newCount = this.cnt + (node ? 0 : 1);
        return new ArrayNode(null, newCount, clone_and_set(this.arr, idx, newNode));
    };

    ArrayNode.prototype.setTransient = function (editRef, shift, hash, key, val, didAddLeaf) {
        var idx = (hash >>> shift) & MASK;
        var node = this.arr[idx];
        var newNode = (node || __EMPTY_MNODE).setTransient(editRef, shift + SHIFT, hash, key, val, didAddLeaf);
        if (newNode === node) {
            return this;
        }
        var editable = this.ensureEditable(editRef);
        editable.arr[idx] = newNode;
        if (node == null) {
            editable.cnt++;
        }
        return editable;
    };

    ArrayNode.prototype.ensureEditable = function (editRef) {
        if (editRef && editRef === this.editRef) {
            return this;
        }
        return new ArrayNode(editRef, this.cnt, this.arr.slice());
    };

    ArrayNode.prototype.iterate = function (map, fn, thisArg) {
        for (var i = 0; i < this.arr.length; i++) {
            var item = this.arr[i];
            if (item && !item.iterate(map, fn, thisArg)) {
                return false;
            }
        }
        return true;
    };
    return ArrayNode;
})();

var HashCollisionNode = (function () {
    function HashCollisionNode(editRef, collisionHash, cnt, arr) {
        this.editRef = editRef;
        this.collisionHash = collisionHash;
        this.cnt = cnt;
        this.arr = arr;
    }
    HashCollisionNode.prototype.get = function (shift, hash, key, not_found) {
        var idx = hash_collision_node_find_index(this.arr, this.cnt, key);
        if (idx >= 0 && key === this.arr[idx]) {
            return this.arr[idx + 1];
        }
        return not_found;
    };

    HashCollisionNode.prototype.delete = function (shift, hash, key) {
        var idx = hash_collision_node_find_index(this.arr, this.cnt, key);
        if (idx === -1) {
            return this;
        }
        if (this.cnt === 1) {
            return null;
        }
        var newArr = this.arr.slice();
        var arrLen = newArr.length;
        if (idx < arrLen - 2) {
            newArr[idx] = newArr[arrLen - 2];
            newArr[idx + 1] = newArr[arrLen - 1];
        }
        newArr.length -= 2;
        return new HashCollisionNode(null, this.collisionHash, this.cnt - 1, newArr);
    };

    HashCollisionNode.prototype.deleteTransient = function (editRef, shift, hash, key, didRemoveLeaf) {
        var idx = hash_collision_node_find_index(this.arr, this.cnt, key);
        if (idx === -1) {
            return this;
        }
        didRemoveLeaf.val = true;
        if (this.cnt === 1) {
            return null;
        }
        var editable = this.ensureEditable(editRef);
        var earr = editable.arr;
        var arrLen = earr.length;
        if (idx < arrLen - 2) {
            earr[idx] = earr[arrLen - 2];
            earr[idx + 1] = earr[arrLen - 1];
        }
        earr.length -= 2;
        editable.cnt--;
        return editable;
    };

    HashCollisionNode.prototype.set = function (shift, hash, key, val, didAddLeaf) {
        if (hash !== this.collisionHash) {
            return new BitmapIndexedNode(null, 1 << ((this.collisionHash >>> shift) & MASK), [null, this]).set(shift, hash, key, val, didAddLeaf);
        }
        var idx = hash_collision_node_find_index(this.arr, this.cnt, key);
        if (idx === -1) {
            var newArr = this.arr.slice();
            newArr.push(key, val);
            didAddLeaf && (didAddLeaf.val = true);
            return new HashCollisionNode(null, this.collisionHash, this.cnt + 1, newArr);
        }
        if (this.arr[idx + 1] === val) {
            return this;
        }
        return new HashCollisionNode(null, this.collisionHash, this.cnt, clone_and_set(this.arr, idx + 1, val));
    };

    HashCollisionNode.prototype.setTransient = function (editRef, shift, hash, key, val, didAddLeaf) {
        if (hash !== this.collisionHash) {
            return new BitmapIndexedNode(editRef, 1 << ((this.collisionHash >>> shift) & MASK), [null, this]).setTransient(editRef, shift, hash, key, val, didAddLeaf);
        }
        var idx = hash_collision_node_find_index(this.arr, this.cnt, key);
        if (idx === -1) {
            var editable = this.ensureEditable(editRef);
            editable.arr.push(key, val);
            editable.cnt += 1;
            didAddLeaf && (didAddLeaf.val = true);
            return editable;
        }
        if (this.arr[idx + 1] === val) {
            return this;
        }
        return edit_and_set(this, editRef, idx + 1, val);
    };

    HashCollisionNode.prototype.ensureEditable = function (editRef) {
        if (editRef && editRef === this.editRef) {
            return this;
        }
        return new HashCollisionNode(editRef, this.collisionHash, this.cnt, this.arr.slice());
    };

    HashCollisionNode.prototype.iterate = function (map, fn, thisArg) {
        return mNodeIterate(map, this.arr, fn, thisArg);
    };
    return HashCollisionNode;
})();

function hashValue(o) {
    if (!o) {
        return 0;
    }
    if (o === true) {
        return 1;
    }
    if (o.hash instanceof Function) {
        return o.hash();
    }
    if (typeof o === 'number') {
        return Math.floor(o) % 2147483647;
    }
    if (typeof o === 'string') {
        return hashString(o);
    }
    throw new Error('Unable to hash');
}

function hashString(string) {
    var hash = STRING_HASH_CACHE[string];
    if (hash == null) {
        // The hash code for a string is computed as
        // s[0] * 31 ^ (n - 1) + s[1] * 31 ^ (n - 2) + ... + s[n - 1],
        // where s[i] is the ith character of the string and n is the length of
        // the string. We mod the result to make it between 0 (inclusive) and 2^32
        // (exclusive).
        hash = 0;
        for (var ii = 0; ii < string.length; ii++) {
            hash = (31 * hash + string.charCodeAt(ii)) % STRING_HASH_MAX_VAL;
        }
        if (STRING_HASH_CACHE_SIZE === STRING_HASH_CACHE_MAX_SIZE) {
            STRING_HASH_CACHE_SIZE = 0;
            STRING_HASH_CACHE = {};
        }
        STRING_HASH_CACHE_SIZE++;
        STRING_HASH_CACHE[string] = hash;
    }
    return hash;
}

var STRING_HASH_MAX_VAL = 0x100000000;
var STRING_HASH_CACHE_MAX_SIZE = 255;
var STRING_HASH_CACHE_SIZE = 0;
var STRING_HASH_CACHE = {};

function mNodeIterate(map, arr, fn, thisArg) {
    for (var i = 0; i < arr.length; i += 2) {
        var k = arr[i];
        if (k != null) {
            if (fn.call(thisArg, arr[i + 1], k, map) === false) {
                return false;
            }
        } else {
            var node = arr[i + 1];
            if (node && !node.iterate(map, fn, thisArg)) {
                return false;
            }
        }
    }
    return true;
}

function hash_collision_node_find_index(arr, cnt, key) {
    var lim = 2 * cnt;
    for (var i = 0; i < lim; i += 2) {
        if (key === arr[i]) {
            return i;
        }
    }
    return -1;
}

function bitmap_indexed_node_index(bitmap, bit) {
    return bit_count(bitmap & (bit - 1));
}

// Hamming weight
function bit_count(n) {
    n -= (n >> 1) & 0x55555555;
    n = (n & 0x33333333) + ((n >> 2) & 0x33333333);
    return (((n + (n >> 4)) & 0x0F0F0F0F) * 0x01010101) >> 24;
}

function remove_pair(arr, i) {
    var newArr = arr.slice();
    newArr.splice(2 * i, 2);
    return newArr;
}

// TODO: inline
function clone_and_set(arr, i, a, j, b) {
    var newArr = arr.slice();
    newArr[i] = a;
    if (j != null) {
        newArr[j] = b;
    }
    return newArr;
}

// TODO: inline
function edit_and_set(node, editRef, i, a, j, b) {
    var editable = node.ensureEditable(editRef);
    editable.arr[i] = a;
    if (j != null) {
        editable.arr[j] = b;
    }
    return editable;
}

function edit_and_remove_pair(node, editRef, bit, i) {
    if (this.bitmap === bit) {
        return null;
    }
    var editable = node.ensureEditable(editRef);
    var earr = editable.arr;
    editable.bitmap = bit ^ editable.bitmap;
    earr.splice(2 * i, 2);
    return editable;
}

function pack_array_node(array_node, editRef, idx) {
    var arr = array_node.arr;
    var len = 2 * (array_node.cnt - 1);
    var new_arr = new Array(len);
    var j = 1;
    var bitmap = 0;
    for (var i = 0; i < len; i++) {
        if (i !== idx && arr[i] != null) {
            new_arr[j] = arr[i];
            bitmap |= 1 << i;
            j += 2;
        }
    }
    return new BitmapIndexedNode(editRef, bitmap, new_arr);
}

var SHIFT = 5;
var SIZE = 1 << SHIFT;
var MASK = SIZE - 1;
var __SENTINEL = {};
var __EMPTY_MNODE = new BitmapIndexedNode(null, 0, []);
var __EMPTY_MAP;
//# sourceMappingURL=Map.js.map
