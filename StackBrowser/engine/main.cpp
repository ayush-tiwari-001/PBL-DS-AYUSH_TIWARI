#include "history.hpp"

#include <cstdio>
#include <cstdlib>
#include <iostream>
#include <map>
#include <memory>
#include <sstream>
#include <string>

using namespace std;

static string jsonEscape(const string& s) {
    string o;
    o.reserve(s.size() + 8);

    for (unsigned char c : s) {
        switch (c) {
            case '"':  o += "\\\""; break;
            case '\\': o += "\\\\"; break;
            case '\n': o += "\\n";  break;
            case '\r': o += "\\r";  break;
            case '\t': o += "\\t";  break;

            default:
                if (c < 0x20) {
                    char buf[8];
                    snprintf(buf, sizeof buf, "\\u%04x", c);
                    o += buf;
                } else {
                    o += static_cast<char>(c);
                }
        }
    }

    return o;
}

static string str(const string& s) {
    return "\"" + jsonEscape(s) + "\"";
}

static string stateJson(const TwoStackHistory& h) {
    ostringstream o;

    o << "\"state\":{"
      << "\"capacity\":" << h.capacity()
      << ",\"backTop\":" << h.backTop()
      << ",\"forwardTop\":" << h.forwardTop()
      << ",\"backCount\":" << h.backCount()
      << ",\"forwardCount\":" << h.forwardCount()
      << ",\"canGoBack\":" << (h.canGoBack() ? "true" : "false")
      << ",\"canGoForward\":" << (h.canGoForward() ? "true" : "false")
      << ",\"current\":" << str(h.current())
      << ",\"cells\":[";

    for (size_t i = 0; i < h.capacity(); ++i) {
        if (i) o << ",";
        if (h.occupied(i))
            o << str(h.cell(i));
        else
            o << "null";
    }

    o << "]}";
    return o.str();
}

static void reply(bool ok, const string& message, const TwoStackHistory* h) {
    cout << "{\"ok\":" << (ok ? "true" : "false")
         << ",\"message\":" << str(message);

    if (h)
        cout << "," << stateJson(*h);

    cout << "}\n" << flush;
}

int main(int argc, char** argv) {
    size_t capacity = 16;

    if (argc > 1) {
        long v = atol(argv[1]);

        if (v >= 4 && v <= 256)
            capacity = static_cast<size_t>(v);
    }

    map<string, unique_ptr<TwoStackHistory>> tabs;
    string line;

    while (getline(cin, line)) {
        if (!line.empty() && line.back() == '\r')
            line.pop_back();

        istringstream in(line);
        string cmd, tab;

        in >> cmd >> tab;

        if (cmd.empty())
            continue;

        if (cmd == "NEW") {
            tabs[tab] = make_unique<TwoStackHistory>(capacity);

            reply(
                true,
                "NEW tab " + tab + " (array capacity " + to_string(capacity) + ")",
                tabs[tab].get()
            );

            continue;
        }

        if (cmd == "CLOSE") {
            bool had = tabs.erase(tab) > 0;

            reply(
                had,
                had ? "CLOSE tab " + tab : "CLOSE: unknown tab",
                nullptr
            );

            continue;
        }

        auto it = tabs.find(tab);

        if (it == tabs.end()) {
            reply(false, "unknown tab " + tab, nullptr);
            continue;
        }

        TwoStackHistory& h = *it->second;

        if (cmd == "VISIT") {
            string url;
            getline(in, url);

            size_t p = url.find_first_not_of(' ');
            url = (p == string::npos) ? "" : url.substr(p);

            if (url.empty()) {
                reply(false, "VISIT needs a url", &h);
                continue;
            }

            auto r = h.visit(url);
            reply(r.ok, r.message, &h);

        } else if (cmd == "BACK") {
            auto r = h.back();
            reply(r.ok, r.message, &h);

        } else if (cmd == "FORWARD") {
            auto r = h.forward();
            reply(r.ok, r.message, &h);

        } else if (cmd == "RESET") {
            auto r = h.reset();
            reply(r.ok, r.message, &h);

        } else if (cmd == "STATE") {
            reply(true, "STATE", &h);

        } else {
            reply(false, "unknown command " + cmd, &h);
        }
    }

    return 0;
}