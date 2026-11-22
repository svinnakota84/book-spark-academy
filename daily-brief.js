(() => {
  const section = document.querySelector('#daily');
  const status = section.querySelector('[data-news-status]');
  const list = section.querySelector('[data-news-list]');
  const dateFormat = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium', timeStyle: 'short',
  });
  let lastEdition;

  function render(edition) {
    const checked = new Date(edition.checkedAt);
    const age = Date.now() - checked.getTime();
    const delayed = age > 90 * 60 * 1000 ? ' · Refresh delayed' : '';
    const partial = edition.unavailableSources.length
      ? ' · Some sources unavailable' : '';
    status.textContent = 'Feeds checked ' + dateFormat.format(checked) + delayed + partial;
    list.replaceChildren();

    if (!edition.articles.length) {
      const empty = document.createElement('p');
      empty.textContent = 'No recent headlines from the available sources.';
      list.append(empty);
      return;
    }

    for (const item of edition.articles) {
      const url = new URL(item.url);
      if (url.protocol !== 'https:') continue;
      const card = document.createElement('article');
      card.className = 'daily-brief-card';
      const source = document.createElement('small');
      source.textContent = item.topic + ' · ' + item.source;
      const title = document.createElement('h3');
      const link = document.createElement('a');
      link.href = url.href;
      link.textContent = item.title;
      title.append(link);
      const published = document.createElement('time');
      published.dateTime = item.publishedAt;
      published.textContent = dateFormat.format(new Date(item.publishedAt));
      card.append(source, title, published);
      list.append(card);
    }
  }

  async function refresh() {
    try {
      const response = await fetch('./daily-brief.json', { cache: 'no-cache' });
      if (!response.ok) throw new Error('Daily Brief unavailable');
      const edition = await response.json();
      render(edition);
      lastEdition = edition;
    } catch {
      if (lastEdition) {
        render(lastEdition);
        status.textContent += ' · Latest check failed';
      } else {
        status.textContent = 'Headlines are temporarily unavailable. Check the sources below.';
      }
    }
  }

  refresh();
  setInterval(() => {
    if (!document.hidden) refresh();
  }, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refresh();
  });
})();
