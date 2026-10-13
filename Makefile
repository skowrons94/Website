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
        data data-committed test-data

help:                       ## show this list
	@grep -hE '^[a-z0-9-]+:.*?## ' $(MAKEFILE_LIST) \
	 | awk 'BEGIN{FS=":.*?## "}{printf "  \033[1m%-14s\033[0m %s\n", $$1, $$2}'

env:                        ## create .env from the example, if absent
	@test -f .env || { cp .env.example .env; \
	  sed -i -e "s/^AZURE2_UID=.*/AZURE2_UID=$$(stat -c %u server/evaluations)/" \
	         -e "s/^AZURE2_GID=.*/AZURE2_GID=$$(stat -c %g server/evaluations)/" .env; \
	  echo "created .env (AZURE2_UID/GID set to the owner of server/evaluations)"; \
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

evaluations:                ## pick up new or edited evaluations, without a rebuild
	$(COMPOSE) restart azure2
	@$(MAKE) --no-print-directory check

warm:                       ## precompute every evaluation's curves and timings (fails if one fails)
	$(COMPOSE) exec -T azure2 python3 -m app.warm $(ID)

# -- R-matrix evaluations (docs/ADDING-AN-EVALUATION.md) ---------------------
# add-evaluation reads the model with pyazr when it can (AZURE2_SRC, below, or
# a pip-installed pyazr) to fill in the reactions; without it, it asks you to.

PYTHON ?= python3

add-evaluation:             ## add one: make add-evaluation ID=12C AZR=path/to/12C.azr [DATA=dir]
	@test -n "$(ID)" -a -n "$(AZR)" || { \
	  echo "usage: make add-evaluation ID=12C AZR=~/azure/12C/12C.azr [DATA=~/azure/12C/data] [FORCE=1]"; \
	  echo "       (docs/ADDING-AN-EVALUATION.md)"; exit 2; }
	PYTHONPATH="$(AZURE2_SRC)$${PYTHONPATH:+:$$PYTHONPATH}" $(PYTHON) scripts/add-evaluation.py \
	  "$(ID)" "$(AZR)" $(if $(DATA),--data "$(DATA)") $(if $(FORCE),--force)

check-evaluations:          ## check every evaluation's info.json, .azr and data files
	cd server && $(PYTHON) -m app.check $(ID)
	@if command -v node > /dev/null; then node scripts/evaluations-check.mjs --quiet $(ID); fi

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

dev-server:                 ## run the AZURE2 API locally on :5001
	cd server && PYTHONPATH=$(AZURE2_SRC) python3 main.py

dev-site:                   ## run the site locally on :3000, against that API
	API_BASE=http://localhost:5001 npm run dev
