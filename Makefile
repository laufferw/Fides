test:
	node --test tests/
	python3 -m pytest -q tests/

serve:
	@echo "Open http://localhost:8000/site/"
	python3 -m http.server 8000

data:
	python3 pipeline/usdm.py
	python3 pipeline/eia_generation_mix.py
	python3 pipeline/cdss_water_rights.py

.PHONY: test serve data
