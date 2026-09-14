from flask import Flask, jsonify, request
from flask_cors import CORS
import os, json

app = Flask(__name__)
CORS(app)
DATA_DIR = os.path.join(os.path.dirname(__file__), 'data')

@app.route('/api/data')
def get_form_data():
    form_id = request.args.get('formId', '')
    result = {}

    # 1. Luôn luôn load rules.json (bộ rule chung cho mọi form)
    rules_path = os.path.join(DATA_DIR, 'rules.json')
    if os.path.exists(rules_path):
        with open(rules_path, 'r', encoding='utf-8') as f:
            result['rules'] = json.load(f)

    # 2. Nếu form có config riêng (preActions, data cụ thể) thì merge thêm
    if form_id:
        form_path = os.path.join(DATA_DIR, f'{form_id}.json')
        if os.path.exists(form_path):
            with open(form_path, 'r', encoding='utf-8') as f:
                fc = json.load(f)
            for key in ['preActions', 'data', 'aliases']:
                if key in fc:
                    result[key] = fc[key]
            print(f'[+] Form {form_id}: loaded specific config')
        else:
            print(f'[-] Form {form_id}: no specific config, using rules only')

    return jsonify(result)

if __name__ == '__main__':
    print('[*] Auto Fill Backend v3.0 - Rule-Based Engine')
    print('[*] Running at http://localhost:5000')
    app.run(host='0.0.0.0', port=5000, debug=True)
