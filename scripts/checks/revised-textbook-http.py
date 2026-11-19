#!/usr/bin/env python3
"""Check revised/legacy routes and actual media delivery from a static server."""
import argparse
import json
from pathlib import Path
import urllib.request

ROOT = Path(__file__).resolve().parents[2]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--origin", required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    origin = args.origin.rstrip("/")
    checked = []

    def get(path, media=False):
        headers = {"Range": "bytes=0-31"} if media else {}
        request = urllib.request.Request(origin + path, headers=headers)
        with urllib.request.urlopen(request, timeout=30) as response:
            content = response.read()
            assert response.status == (206 if media else 200), path
            if media:
                assert len(content) == 32, path
                assert response.headers.get_content_type() == "audio/mpeg", path
                assert response.headers.get("Content-Range", "").startswith("bytes 0-31/"), path
            checked.append(path)
            return content

    def data(path):
        return json.loads(get(path))

    books = json.loads((ROOT / "content/editions/2026/catalog.json").read_text())["books"]
    parallel = json.loads((ROOT / "content/editions/five-four/catalog.json").read_text())["books"]
    jingtong = int((ROOT / "content/editions/jingtong/english-g5up-2026.json").is_file())
    assert len(data("/data/index.json")["books"]) == 45 + len(books) + len(parallel) + jingtong
    for book in books:
        for book_id in (book["id"], book["legacyId"]):
            get(f"/book/{book_id}/")
            outline = data(f"/data/books/{book_id}/outline.json")
            meta = outline["lessons"][0]
            get(f"/lesson/{book_id}/{meta['id']}/")
            lesson = data(f"/data/books/{book_id}/lessons/{meta['id']}.json")
            get(lesson["questions"][0]["audio"]["question"], media=True)
        get(f"/book/{book['id']}/guide/{book['units'][0]['unit_number']}/")
        if book["readings"]:
            passages = data(f"/data/books/{book['id']}/passages.json")["passages"]
            passage = passages[0]
            get(f"/reading/{book['id']}/")
            get(f"/reading/{book['id']}/{passage['id']}/")
            get(passage["sentences"][0]["audio"], media=True)
            image = get(passage["pageImages"][0])
            assert image.startswith(b"\xff\xd8"), passage["id"]
    report = {"status": "passed", "origin": origin, "requests": len(checked), "paths": checked}
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(f"PASS: {len(checked)} revised/legacy HTTP routes, official images and MP3 byte ranges")


if __name__ == "__main__":
    main()
