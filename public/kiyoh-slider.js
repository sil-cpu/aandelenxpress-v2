(function () {
  const reviews = [
    { name: 'Sanne', rating: 4.5, date: '2024-09-03', text: 'Snelle levering en de gadgets waren precies wat ik nodig had! Dit maakt het leven...' },
    { name: 'anoniem', rating: 5, date: '2024-09-03', text: 'Super geholpen. Leuke medewerkers en ook het product is goed in de smaak gevallen. Wij...' },
    { name: 'anoniem', rating: 5, date: '2023-10-19', text: 'Goede ervaring' },
    { name: 'Jeroen', rating: 5, date: '2024-08-21', text: 'Duidelijke communicatie, snelle opvolging en alles netjes binnen de afgesproken termijn geregeld.' },
    { name: 'Linda', rating: 4.5, date: '2024-08-11', text: 'Heldere uitleg tijdens het proces en fijn dat alles digitaal kon worden afgehandeld.' },
    { name: 'anoniem', rating: 5, date: '2024-07-26', text: 'Professioneel team en een resultaat waar we direct mee verder konden.' },
    { name: 'Mark', rating: 5, date: '2024-07-04', text: 'Snel, transparant en kundig. Precies wat wij zochten voor onze klant.' },
    { name: 'Eva', rating: 4.5, date: '2024-06-18', text: 'Fijne begeleiding van begin tot eind. Alles was goed geregeld en duidelijk.' },
    { name: 'anoniem', rating: 5, date: '2024-05-30', text: 'Goede service en prettige communicatie. Absoluut aan te bevelen.' },
    { name: 'Patrick', rating: 5, date: '2024-05-08', text: 'Binnen korte tijd was alles rond. Dat scheelt ons echt veel tijd.' },
    { name: 'Sofia', rating: 5, date: '2024-04-19', text: 'De begeleiding was professioneel en vriendelijk, met oog voor detail.' },
    { name: 'anoniem', rating: 4.5, date: '2024-03-27', text: 'Goede ervaring van begin tot eind. Ik zou het zo opnieuw doen.' }
  ];

  function starsHtml(rating) {
    const fullStars = Math.floor(rating);
    const halfStar = rating % 1 >= 0.5;
    let output = '';
    for (let i = 0; i < fullStars; i += 1) output += '&#9733;';
    if (halfStar) output += '&#9733;';
    while ((output.match(/&#9733;/g) || []).length < 5) output += '&#9734;';
    return output;
  }

  function renderReview(review) {
    return `
      <article class="kiyoh-review-card">
        <div class="kiyoh-review-head">
          <span class="kiyoh-review-name">${review.name}</span>
          <span class="kiyoh-review-stars">${starsHtml(review.rating)}</span>
        </div>
        <p>${review.text}</p>
        <div class="kiyoh-review-date">${review.date}</div>
      </article>
    `;
  }

  function initWidget(widget) {
    const list = widget.querySelector('.kiyoh-review-list');
    const left = widget.querySelector('.kiyoh-arrow-left');
    const right = widget.querySelector('.kiyoh-arrow-right');
    if (!list || !left || !right) return;

    list.innerHTML = reviews.map(renderReview).join('');

    const getStep = () => {
      const card = list.querySelector('.kiyoh-review-card');
      if (!card) return list.clientWidth * 0.9;
      const styles = window.getComputedStyle(list);
      const gap = parseFloat(styles.gap || styles.columnGap || '18') || 18;
      return card.getBoundingClientRect().width + gap;
    };

    const updateButtons = () => {
      const maxScrollLeft = Math.max(0, list.scrollWidth - list.clientWidth - 2);
      left.disabled = list.scrollLeft <= 1;
      right.disabled = list.scrollLeft >= maxScrollLeft;
    };

    left.addEventListener('click', () => {
      list.scrollBy({ left: -getStep(), behavior: 'smooth' });
    });

    right.addEventListener('click', () => {
      list.scrollBy({ left: getStep(), behavior: 'smooth' });
    });

    list.addEventListener('scroll', () => {
      window.requestAnimationFrame(updateButtons);
    }, { passive: true });

    window.addEventListener('resize', updateButtons, { passive: true });
    updateButtons();
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.kiyoh-widget').forEach(initWidget);
  });
})();
