#!/bin/bash
# usage: batch.sh jobsfile  (lines: query W H DPR name), runs 6 at a time
cd /tmp/storepro
xargs -P 6 -L 1 ./render.sh < "$1"
