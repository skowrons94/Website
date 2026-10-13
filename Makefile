# Deployment shortcuts. Everything here is a thin wrapper over docker compose --
# nothing is hidden, and `docker compose ...` remains equivalent throughout.
#
#   make deploy     first run, or after changing the AZURE2 image
#   make update     publish content or site changes (rebuilds the site only)
#   make check      is it up?
#   make logs       follow everything
#   make add-evaluation ID=12C AZR=~/azure/12C.azr   add an R-matrix evaluation
#                   (docs/ADDING-AN-EVALUATION.md)
#
# `make` on its own prints this list.

COMPOSE ?= docker compose

.DEFAULT_GOAL := help
.PHONY: help env deploy update restart down logs logs-web logs-azure2 check \
        evaluations warm add-evaluation check-evaluations dev-server dev-site \
        data data-committed test-data demo

help:                       ## show this list
	@grep -hE '^[a-z0-9-]+:.*?## ' $(MAKEFILE_LIST) \
	 | awk 'BEGIN{FS=":.*?## "}{printf "  \033[1m%-14s\033[0m %s\n", $$1, $$2}'

env:                        ## create .env from the example, if absent
	@test -f .env || { cp .env.example .env; \
	  mem=$$(awk '/^MemTotal/ {m = int($$2 / 1024) - 1024; if (m < 1024) m = 1024; print m "m"}' /proc/meminfo); \
	  cpus=$$(awk -v n=$$(nproc) 'BEGIN {c = n - 0.5; if (c < 1) c = 1; print c}'); \
	  sed -i -e "s/^AZURE2_UID=.*/AZURE2_UID=$$(stat -c %u server/evaluations)/" \
	         -e "s/^AZURE2_GID=.*/AZURE2_GID=$$(stat -c %g server/evaluations)/" \
	         -e "s/^AZURE2_MEM_LIMIT=.*/AZURE2_MEM_LIMIT=$$mem/" \
	         -e "s/^AZURE2_CPUS=.*/AZURE2_CPUS=$$cpus/" .env; \
	  echo "created .env (AZURE2_UID/GID: the owner of server/evaluations; AZURE2_MEM_LIMIT=$$mem, AZURE2_CPUS=$$cpus)"; \
	  echo "-- set SITE_DOMAIN and ACME_EMAIL in it, then run: make deploy"; }
	@test -f .env && grep -q '^SITE_DOMAIN=example.com' .env \
	  && echo "WARNING: .env still says SITE_DOMAIN=example.com" || true

deploy: env                 ## build everything and bring the stack up
	$(COMPOSE) up -d --build
	@$(MAKE) --no-print-directory check

update:                     ## rebuild and restart the site only, leaving AZURE2 running
	$(COMPOSE) up -d --build web
	@$(MAKE) --no-print-directory check

restart:                    ## restart the running containers, no rebuild
	$(COMPOSE) restart

down:                       ## stop the stack (certificates and data are kept)
	$(COMPOSE) down

logs:                       ## follow all logs
	$(COMPOSE) logs -f --tail=100

logs-web:                   ## follow the site's logs
	$(COMPOSE) logs -f --tail=100 web

logs-azure2:                ## follow the AZURE2 API's logs
	$(COMPOSE) logs -f --tail=100 azure2

check:                      ## container status, and what the API reports
	@$(COMPOSE) ps
	@echo
	@$(COMPOSE) exec -T azure2 python3 -c \
	  "import json,urllib.request as u; \
	   print('azure2:', json.load(u.urlopen('http://localhost:5001/api/health')))" \
	  2>/dev/null || echo "azure2: not answering yet"
	@$(COMPOSE) exec -T web wget -qO- http://localhost:3000/webdaq-demo/index.html 2>/dev/null \
	  | grep -q 'webdaq-demo' && echo "webdaq-demo: served" || echo "webdaq-demo: not found"

evaluations:                ## pick up new or edited evaluations, without a rebuild
	$(COMPOSE) restart azure2
	@$(MAKE) --no-print-directory check

warm:                       ## precompute every evaluation's curves and timings (fails if one fails)
	@id=$(call shq,$(value ID)); $(check_id_optional) \
	$(COMPOSE) exec -T azure2 python3 -m app.warm $${id:+"$$id"}

# -- R-matrix evaluations (docs/ADDING-AN-EVALUATION.md) ---------------------
# add-evaluation reads the model with pyazr when it can (AZURE2_SRC, below, or
# a pip-installed pyazr) to fill in the reactions; without it, it asks you to.

PYTHON ?= python3

# ID, AZR, DATA and FORCE reach the shell as single-quoted words of their raw
# (unexpanded) values, never as recipe text, so a path holding ", `, $( ) or
# ; is only a path; the ID must look like one. (r15 security #5)
# Not exported either: make would expand an exported value ($(shell ...)) to
# build each recipe's environment.
unexport ID AZR DATA FORCE
shq = '$(subst ','\'',$(1))'
check_id_optional = case "$$id" in "") ;; [!A-Za-z0-9]*|*[!A-Za-z0-9_.-]*) \
	  echo "ID must match ^[A-Za-z0-9][A-Za-z0-9_.-]*\$$, e.g. ID=12C" >&2; exit 2;; esac;

add-evaluation:             ## add one: make add-evaluation ID=12C AZR=path/to/12C.azr [DATA=dir]
	@id=$(call shq,$(value ID)); azr=$(call shq,$(value AZR)); \
	data=$(call shq,$(value DATA)); force=$(call shq,$(value FORCE)); \
	src=$(call shq,$(value AZURE2_SRC)); \
	if [ -z "$$id" ] || [ -z "$$azr" ]; then \
	  echo "usage: make add-evaluation ID=12C AZR=~/azure/12C/12C.azr [DATA=~/azure/12C/data] [FORCE=1]"; \
	  echo "       (docs/ADDING-AN-EVALUATION.md)"; exit 2; fi; \
	$(check_id_optional) \
	set -- "$$id" "$$azr"; \
	if [ -n "$$data" ]; then set -- "$$@" --data "$$data"; fi; \
	if [ -n "$$force" ]; then set -- "$$@" --force; fi; \
	PYTHONPATH="$$src$${PYTHONPATH:+:$$PYTHONPATH}" $(PYTHON) scripts/add-evaluation.py "$$@"

check-evaluations:          ## check every evaluation's info.json, .azr and data files
	@id=$(call shq,$(value ID)); $(check_id_optional) \
	(cd server && $(PYTHON) -m app.check $${id:+"$$id"}) && \
	if command -v node > /dev/null; then node scripts/evaluations-check.mjs --quiet $${id:+"$$id"}; fi

# -- the data explorer's data (scripts/data/README.md) ---------------------
# Needs python3 (3.10+) with PyYAML, and git. Inputs are cached in build/dx/
# (about 600 MB); the output goes to public/data/ (about 480 MB), which the
# site image copies. Run before `make update`.

data:                       ## build the explorer's EXFOR shards and ENSDF summaries (~8 min)
	$(PYTHON) scripts/data/dx.py fetch-exfor
	$(PYTHON) scripts/data/dx.py build-exfor --shards all
	$(PYTHON) scripts/data/dx.py fetch-ensdf
	$(PYTHON) scripts/data/dx.py build-ensdf --set scope
	$(PYTHON) scripts/data/dx.py check --shards 500

data-committed:             ## regenerate the committed part of public/data (index, meta, atlas ENSDF)
	rm -rf public/data/exfor/r public/data/exfor/sets public/data/ensdf
	$(PYTHON) scripts/data/dx.py fetch-exfor
	$(PYTHON) scripts/data/dx.py build-exfor --shards none
	$(PYTHON) scripts/data/dx.py fetch-ensdf
	$(PYTHON) scripts/data/dx.py build-ensdf --set atlas
	$(PYTHON) scripts/data/dx.py check

test-data:                  ## the pipeline's tests (pytest, jsonschema)
	$(PYTHON) -m pytest -q scripts/data/tests

# -- local development -------------------------------------------------------
# The API needs pyazr, which ships with AZURE2. Point AZURE2_SRC at a checkout
# built with -DUSE_API=ON, or pip install it.

AZURE2_SRC ?= ../AZURE2

# The site on :3000 calls the API on :5001, another origin: CORS is allowed
# for that one origin only (production is same-origin and sends none).
DEV_ORIGINS ?= http://localhost:3000,http://127.0.0.1:3000

dev-server:                 ## run the AZURE2 API locally on :5001
	cd server && PYTHONPATH=$(AZURE2_SRC) AZURE2_CORS_ORIGINS=$(DEV_ORIGINS) python3 main.py

dev-site:                   ## run the site locally on :3000, against that API
	API_BASE=http://localhost:5001 npm run dev

# The WebDAQ demo into public/webdaq-demo/ (webdaq-demo/README.md). `next dev`
# does not serve its directory indexes: look at it with
# `python3 webdaq-demo/tests/contract/serve.py public/webdaq-demo /webdaq-demo`
# or a static export of the site. The Docker image builds it itself.
demo:                       ## build the WebDAQ demo into public/webdaq-demo (~1 min)
	cd webdaq-demo && npm ci --ignore-scripts && node build.mjs
