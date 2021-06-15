#!/usr/bin/env python3

from os import path
from bs4 import BeautifulSoup
from subprocess import CalledProcessError, check_call
from tempfile import TemporaryDirectory

html = open('index.html').read()
parsed_html = BeautifulSoup(html, features='html.parser')
script_tag = parsed_html.body.find(id='main')
[script] = script_tag.children

with TemporaryDirectory() as dir:
    ts = path.join(dir, 'main.ts')
    with open(ts, 'w') as f:
        f.write('\n' * (script_tag.sourceline - 1))
        f.write(script)
    try:
        check_call(['tsc', '--lib', 'es2017,dom', '--noEmit', '--strict', '--target', 'ES5', ts])
    except CalledProcessError as e:
        exit(e.returncode)
