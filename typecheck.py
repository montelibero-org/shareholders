#!/usr/bin/env python3

from os import path
from bs4 import BeautifulSoup
from subprocess import run
from tempfile import TemporaryDirectory
from sys import stderr, stdout

html = open('index.html').read()
parsed_html = BeautifulSoup(html, features='html.parser')
script_tag = parsed_html.body.find(id='main')
[script] = script_tag.children

with TemporaryDirectory() as dir:
    ts = path.join(dir, 'main.ts')
    rel = path.relpath(ts)
    with open(ts, 'w') as f:
        f.write('\n' * (script_tag.sourceline - 1))
        f.write(script)
    p = run(
        ['tsc',
         '--lib', 'es2017,dom',
         '--noEmit',
         '--pretty',
         '--strict',
         '--target', 'ES5',
         ts,
         ],
        capture_output=True,
    )
    stdout.write(p.stdout.decode().replace(rel, './index.html'))
    stderr.write(p.stderr.decode())
    exit(p.returncode)
