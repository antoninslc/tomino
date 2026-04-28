#!/usr/bin/env python3
"""Script pour insérer la route des dividendes dans app.py"""

with open('app.py', 'r', encoding='utf-8') as f:
    content = f.read()

# Chercher le point d'insertion : juste avant "@app.route("/api/evenements/prochains"
target = '@app.route("/api/evenements/prochains", methods=["POST"])'
if target not in content:
    print("Target route not found!")
    exit(1)

new_route = '''@app.route("/api/stock/dividendes-historique/<ticker>")
def api_stock_dividendes_historique(ticker):
    ticker = str(ticker).strip().upper()
    if not ticker:
        return jsonify({"ok": False, "erreur": "Ticker manquant"}), 400
    divs = prices.get_historique_dividendes(ticker, limit=5)
    return jsonify({"ok": True, "dividendes": divs, "ticker": ticker})


'''

# Insérer avant la route des événements
new_content = content.replace(target, new_route + target)

with open('app.py', 'w', encoding='utf-8') as f:
    f.write(new_content)

print("Route dividendes-historique ajoutée avec succès !")
