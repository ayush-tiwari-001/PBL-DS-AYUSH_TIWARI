CXX ?= g++
CXXFLAGS ?= -std=c++17 -O2 -Wall -Wextra

bin/history_engine: main.cpp history.hpp
	mkdir -p bin
	$(CXX) $(CXXFLAGS) -o $@ main.cpp

clean:
	rm -rf bin
