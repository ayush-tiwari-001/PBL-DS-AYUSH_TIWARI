// history.hpp - Browser history using TWO STACKS IN ONE ARRAY.
//
//   index:  0                                              N-1
//          [ b0 b1 b2 b3 .  .  .  .  .  .  f3 f2 f1 f0 ]
//            ->  Back stack grows right      <-  Forward stack grows left
//
// * The Back stack starts at index 0 and grows toward the right.
// * The Forward stack starts at index N-1 and grows toward the left.
// * The two stacks share one fixed array; the array is "full" only when
//   they meet in the middle (backCount + forwardCount == N).
// * The page currently on screen is held separately in `current_`.
//
// Operations (all O(1) except eviction when the array is completely full):
//   visit(url)  : push current onto Back, clear Forward, current = url
//   back()      : push current onto Forward, current = pop Back
//   forward()   : push current onto Back,    current = pop Forward
#pragma once

#include <string>
#include <vector>
#include <cstddef>
using namespace std;
class TwoStackHistory {
public:
    explicit TwoStackHistory(size_t capacity = 16)
        : cells_(capacity < 4 ? 4 : capacity),
          occupied_(cells_.size(), false),
          backTop_(-1),                                  // index of Back top (-1 = empty)
          fwdTop_(static_cast<long>(cells_.size())) {}   // index of Forward top (N = empty)

    // Result of an operation, used for the live operation log.
    struct Result {
        bool ok = false;
        string message;
    };

    size_t capacity() const { return cells_.size(); }
    long backTop() const { return backTop_; }
    long forwardTop() const { return fwdTop_; }
    size_t backCount() const { return static_cast<size_t>(backTop_ + 1); }
    size_t forwardCount() const { return cells_.size() - static_cast<size_t>(fwdTop_); }
    bool canGoBack() const { return backTop_ >= 0; }
    bool canGoForward() const { return fwdTop_ < static_cast<long>(cells_.size()); }
    const string& current() const { return current_; }
    bool occupied(size_t i) const { return occupied_[i]; }
    const string& cell(size_t i) const { return cells_[i]; }

    Result visit(const string& url) {
        Result r;
        string note;
        // A new visit invalidates everything that was "ahead" of the current page.
        size_t dropped = clearForward();
        if (hasCurrent_) {
            string evicted;
            if (isFull()) {                // Back stack has grown all the way to the right edge
                evictOldestBack();
                evicted = " (array full: oldest Back entry evicted)";
            }
            pushBack(current_);
            note = "pushBack(" + current_ + ") -> index " + to_string(backTop_) + evicted;
        }
        if (dropped > 0) {
            if (!note.empty()) note += "; ";
            note += "Forward stack cleared (" + to_string(dropped) + " dropped)";
        }
        current_ = url;
        hasCurrent_ = true;
        r.ok = true;
        r.message = "VISIT " + url + (note.empty() ? string(" (first page)") : " | " + note);
        return r;
    }

    Result back() {
        Result r;
        if (!canGoBack()) {
            r.message = "BACK ignored: Back stack is empty";
            return r;
        }
        string from = current_;
        pushForward(current_);
        long idx = fwdTop_;
        current_ = popBack();
        r.ok = true;
        r.message = "BACK -> pushForward(" + from + ") at index " + to_string(idx) +
                    ", popBack() = " + current_;
        return r;
    }

    Result forward() {
        Result r;
        if (!canGoForward()) {
            r.message = "FORWARD ignored: Forward stack is empty";
            return r;
        }
        string from = current_;
        pushBack(current_);
        long idx = backTop_;
        current_ = popForward();
        r.ok = true;
        r.message = "FORWARD -> pushBack(" + from + ") at index " + to_string(idx) +
                    ", popForward() = " + current_;
        return r;
    }

    // Empty both stacks but keep the current page.
    Result reset() {
        size_t dropped = backCount() + forwardCount();
        for (size_t i = 0; i < cells_.size(); ++i) { cells_[i].clear(); occupied_[i] = false; }
        backTop_ = -1;
        fwdTop_ = static_cast<long>(cells_.size());
        Result r;
        r.ok = true;
        r.message = "RESET: both stacks cleared (" + to_string(dropped) + " entries dropped)";
        return r;
    }

private:
    vector<string> cells_;
    vector<bool> occupied_;
    long backTop_;
    long fwdTop_;
    string current_;
    bool hasCurrent_ = false;

    bool isFull() const { return backTop_ + 1 >= fwdTop_; }

    void pushBack(const string& url) {
        ++backTop_;
        cells_[backTop_] = url;
        occupied_[backTop_] = true;
    }
    string popBack() {
        string v = cells_[backTop_];
        cells_[backTop_].clear();
        occupied_[backTop_] = false;
        --backTop_;
        return v;
    }
    void pushForward(const string& url) {
        --fwdTop_;
        cells_[fwdTop_] = url;
        occupied_[fwdTop_] = true;
    }
    string popForward() {
        string v = cells_[fwdTop_];
        cells_[fwdTop_].clear();
        occupied_[fwdTop_] = false;
        ++fwdTop_;
        return v;
    }
    // Drop the oldest Back entry (index 0) and shift the rest left by one.
    void evictOldestBack() {
        for (long i = 0; i < backTop_; ++i) cells_[i] = cells_[i + 1];
        cells_[backTop_].clear();
        occupied_[backTop_] = false;
        --backTop_;
    }
    size_t clearForward() {
        size_t n = forwardCount();
        while (canGoForward()) popForward();
        return n;
    }
};
