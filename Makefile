# Deployment shortcuts. Everything here is a thin wrapper over docker compose --
# nothing is hidden, and `docker compose ...` remains equivalent throughout.
#
#   make deploy     first run, or after changing the AZURE2 image
#   make update     publish content or site changes (rebuilds the site only)
#   make check      is it up?
#   make logs       follow everything
#
# `make` on its own prints this list.

COMPOSE ?= docker compose

.DEFAULT_GOAL := help
.PHONY: help env deploy update restart down logs logs-web logs-azure2 check \
        evaluations dev-server dev-site

help:                       ## show this list
	@grep -hE '^[a-z0-9-]+:.*?## ' $(MAKEFILE_LIST) \
	 | awk 'BEGIN{FS=":.*?## "}{printf "  \033[1m%-14s\033[0m %s\n", $$1, $$2}'

env:                        ## create .env from the example, if absent
	@test -f .env || { cp .env.example .env; \
	  echo "created .env -- set SITE_DOMAIN and ACME_EMAIL in it, then run: make deploy"; }
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

# -- local development -------------------------------------------------------
# The API needs pyazr, which ships with AZURE2. Point AZURE2_SRC at a checkout
# built with -DUSE_API=ON, or pip install it.

AZURE2_SRC ?= ../AZURE2

dev-server:                 ## run the AZURE2 API locally on :5001
	cd server && PYTHONPATH=$(AZURE2_SRC) python3 main.py

dev-site:                   ## run the site locally on :3000, against that API
	API_BASE=http://localhost:5001 npm run dev
