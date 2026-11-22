"""Publish source-checked headlines from the BookSpark source register."""
import gzip
import io
import json
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from difflib import SequenceMatcher
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener
from xml.etree import ElementTree

NOW = datetime.now(timezone.utc)
LIMIT = 3_000_000
SOURCES = Path(__file__).with_name("news-sources.json")


class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.text = []
        self.titles = []
        self.heading = None
        self.skip = None

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        if tag in {"script", "style"}:
            self.skip = tag
        if tag in {"title", "h1"}:
            self.heading = []
        if tag == "meta" and attrs.get("property") == "og:title":
            self.titles.append(attrs.get("content", ""))

    def handle_endtag(self, tag):
        if tag == self.skip:
            self.skip = None
        if tag in {"title", "h1"} and self.heading is not None:
            self.titles.append(" ".join(self.heading))
            self.heading = None

    def handle_data(self, data):
        if not self.skip:
            self.text.append(data)
            if self.heading is not None:
                self.heading.append(data)


def normalized(text):
    return " ".join(re.findall(r"\w+", text.casefold().replace("’", "'")))


def permitted(url, host, prefix="/"):
    parsed = urlsplit(url)
    return (parsed.scheme == "https" and parsed.netloc == host and
            parsed.path.startswith(prefix))


def read(url, host, prefix="/"):
    class SamePublisher(HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            if not permitted(newurl, host, prefix):
                raise ValueError("Redirect left approved publisher scope")
            return super().redirect_request(req, fp, code, msg, headers, newurl)

    if not permitted(url, host, prefix):
        raise ValueError("URL left approved publisher scope")
    request = Request(url, headers={"User-Agent": "BookSpark Daily Brief RSS Reader"})
    with build_opener(SamePublisher()).open(request, timeout=10) as response:
        data = response.read(LIMIT + 1)
    if len(data) > LIMIT:
        raise ValueError("Publisher response exceeded size limit")
    if data.startswith(b"\x1f\x8b"):
        with gzip.GzipFile(fileobj=io.BytesIO(data)) as compressed:
            data = compressed.read(LIMIT + 1)
        if len(data) > LIMIT:
            raise ValueError("Expanded publisher response exceeded size limit")
    return data


def read_page(url, host, prefix="/"):
    page = Page()
    page.feed(read(url, host, prefix).decode("utf-8", errors="replace"))
    return page


def read_date(value):
    try:
        date = parsedate_to_datetime(value)
    except ValueError:
        date = datetime.fromisoformat(value)
    if date.tzinfo is None:
        raise ValueError("Publication time must include a timezone")
    return date.astimezone(timezone.utc)


def items(payload, source):
    root = ElementTree.fromstring(payload)
    if root.find("./channel") is None:
        raise ValueError("Publisher response is not an RSS feed")
    if any(item.tag.rsplit("}", 1)[-1].lower() in {"copyright", "rights"}
           and (item.text or "").strip() for item in root.findall("./channel/*")):
        # A feed-wide notice is assessed against the publisher's linked reuse policy.
        print(f"Feed carries a rights notice: {source['name']}", file=sys.stderr)
    for node in root.findall("./channel/item"):
        title = " ".join(node.findtext("title", "").split())
        link = node.findtext("link", "").strip()
        if not normalized(title) or len(title) > 300 or not permitted(link, source["host"], source["articlePath"]):
            continue
        if any(child.tag.rsplit("}", 1)[-1].lower() in {"copyright", "rights", "license"}
               for child in node):
            continue
        try:
            published = read_date(node.findtext("pubDate", ""))
        except (TypeError, ValueError, OverflowError):
            continue
        if not NOW - timedelta(days=7) <= published <= NOW + timedelta(minutes=10):
            continue
        clean = urlsplit(link)
        yield {"title": title, "url": urlunsplit(clean._replace(query="", fragment="")),
               "source": source["name"], "topic": source["topic"],
               "publishedAt": published.isoformat()}


def verify(item, source):
    try:
        page = read_page(item["url"], source["host"], source["articlePath"])
        title = normalized(item["title"])
        for candidate in page.titles:
            official = normalized(candidate)
            if title in official or SequenceMatcher(None, title, official).ratio() >= 0.88:
                return item
    except (OSError, EOFError, ValueError) as error:
        print(f"Article check failed: {item['url']}: {error}", file=sys.stderr)
        return None
    print(f"Headline differs from publisher page: {item['url']}", file=sys.stderr)
    return None


def collect(source):
    name, host = source["name"], source["host"]
    try:
        policy = read_page(source["policy"], host)
        if normalized(source["policyMarker"]) not in normalized(" ".join(policy.text)):
            raise ValueError("Recorded reuse language was not found")
        candidates = list(items(read(source["feed"], host), source))[:12]
        with ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(lambda item: verify(item, source), candidates))
        accepted = [item for item in results if item]
        print(f"{name}: accepted {len(accepted)} of {len(candidates)} recent candidates")
        return accepted
    except (OSError, EOFError, ValueError, ElementTree.ParseError) as error:
        print(f"Source withheld: {name}: {error}", file=sys.stderr)
        return None


def main(output):
    sources = [source for source in json.loads(SOURCES.read_text()) if source["enabled"]]
    with ThreadPoolExecutor(max_workers=len(sources)) as pool:
        results = list(pool.map(collect, sources))
    articles = {}
    for result in results:
        for item in result or []:
            articles.setdefault(item["url"], item)
    edition = {
        "checkedAt": NOW.isoformat(),
        "unavailableSources": [source["name"] for source, result in zip(sources, results)
                               if result is None],
        "articles": sorted(articles.values(), key=lambda item: item["publishedAt"],
                           reverse=True)[:40],
    }
    Path(output).write_text(json.dumps(edition, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    main(sys.argv[1])
