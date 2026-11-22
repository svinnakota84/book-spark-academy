"""Build the public Daily Brief from publisher feeds."""
import gzip
import io
import json
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
from xml.etree import ElementTree

FEEDS = [
    ("UN News", "World", "https://news.un.org/feed/subscribe/en/news/all/rss.xml"),
    ("NIST", "Technology", "https://www.nist.gov/news-events/news/rss.xml"),
    ("NASA JPL", "Science", "https://www.jpl.nasa.gov/feeds/news/"),
    ("Federal Reserve", "Economy", "https://www.federalreserve.gov/feeds/press_all.xml"),
]
NOW = datetime.now(timezone.utc)
MAX_FEED_BYTES = 2_000_000


def read_date(value):
    try:
        date = parsedate_to_datetime(value)
    except ValueError:
        date = datetime.fromisoformat(value)
    if date.tzinfo is None:
        date = date.replace(tzinfo=timezone.utc)
    return date.astimezone(timezone.utc)


def parse_feed(payload, source, topic):
    root = ElementTree.fromstring(payload)
    for node in root.findall("./channel/item"):
        title = " ".join(node.findtext("title", "").split())
        link = node.findtext("link", "").strip()
        url = urlsplit(link)
        if not title or url.scheme != "https" or not url.hostname:
            continue
        try:
            published = read_date(node.findtext("pubDate", ""))
        except (TypeError, ValueError, OverflowError):
            continue
        if NOW - timedelta(days=7) <= published <= NOW + timedelta(minutes=10):
            yield {"title": title, "url": link, "source": source, "topic": topic,
                   "publishedAt": published.isoformat()}


def fetch_feed(feed):
    source, topic, url = feed
    try:
        request = Request(url, headers={"User-Agent": "BookSpark Daily Brief RSS Reader"})
        with urlopen(request, timeout=15) as response:
            payload = response.read(MAX_FEED_BYTES + 1)
        if len(payload) > MAX_FEED_BYTES:
            raise ValueError("Feed exceeds size limit")
        if payload.startswith(b"\x1f\x8b"):
            with gzip.GzipFile(fileobj=io.BytesIO(payload)) as compressed:
                payload = compressed.read(MAX_FEED_BYTES + 1)
            if len(payload) > MAX_FEED_BYTES:
                raise ValueError("Expanded feed exceeds size limit")
        return list(parse_feed(payload, source, topic))
    except (OSError, EOFError, ValueError, ElementTree.ParseError) as error:
        print(f"Feed unavailable: {source}: {error}", file=sys.stderr)
        return None


def main(output):
    with ThreadPoolExecutor(max_workers=len(FEEDS)) as pool:
        results = list(pool.map(fetch_feed, FEEDS))
    if all(result is None for result in results):
        raise SystemExit("All feeds unavailable. Keeping the previous deployment.")
    articles = {}
    for result in results:
        for item in result or []:
            articles.setdefault(item["url"], item)
    edition = {
        "checkedAt": NOW.isoformat(),
        "unavailableSources": [source for (source, _, _), result in zip(FEEDS, results)
                               if result is None],
        "articles": sorted(articles.values(), key=lambda item: item["publishedAt"],
                           reverse=True)[:40],
    }
    Path(output).write_text(json.dumps(edition, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    main(sys.argv[1])
