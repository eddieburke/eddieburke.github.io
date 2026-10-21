document.querySelector('#timestamp').addEventListener('mouseover', event => {
  let tooltip = document.querySelector('#full-date');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = 'full-date'; tooltip.setAttribute('role', 'tooltip'); tooltip.textContent = 'Friday, September 11, 2026 at 8:37 PM';
    document.body.append(tooltip);
  }
  event.currentTarget.setAttribute('aria-describedby', tooltip.id);
});
