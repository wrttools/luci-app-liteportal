'use strict';
'require view';
'require form';
'require uci';
'require ui';
'require portal.common as common';


return view.extend({
	load: function() {
		return uci.load('portal');
	},

	render: function() {
		return common.render_safe(function() {
			let m, s, o;

			const status = common.status_panel();

			m = new form.Map('portal', _('Portal'),
				_('A static HTML portal served by the web server the router already runs, ' +
				  'under the /portal/ sub-path. Settings are persisted in uci and baked ' +
				  'into links.json on apply.'));

			/* --------------------------------------------------------- General -- */

			s = m.section(form.TypedSection, 'portal', _('General'));
			s.anonymous = true;
			s.addremove = false;

			/*
			 * The master switch. Absent or '1' means on; only an explicit '0'
			 * takes the page off the web server. There is no daemon of our own
			 * to stop, so the initial script withdraws the files instead - the
			 * uploaded assets stay, and switching back on republishes them.
			 */
			o = s.option(form.Flag, 'enabled', _('Enable portal'),
				_('Publish the portal page, or take it off the web server. When off, ' +
				  '/portal/ stops resolving; the uploaded icons and backgrounds are kept.'));
			o.default = '1';
			o.rmempty = false;

			o = s.option(form.Value, 'title', _('Page title'));
			o.placeholder = 'My Portal';

			o = s.option(form.Value, 'background', _('Background colour'),
				_('A CSS colour value such as #0e1116.'));
			o.placeholder = '#0e1116';

			/*
			 * The image itself is managed on the Assets page and only reported
			 * here. DummyValue overrides write() to a no-op, so displaying the
			 * path cannot accidentally save it back.
			 */
			o = s.option(form.DummyValue, 'background_file', _('Current background image'),
				_('Chosen on the Assets page. It takes precedence over the colour.'));
			o.cfgvalue = function(section_id) {
				const value = uci.get('portal', section_id, 'background_file');

				return (value != null && value != '') ? value : _('none');
			};

			/*
			 * Appearance sliders. The values stay percentages in uci; the portal page
			 * turns them into the CSS custom properties the stylesheet consumes, so
			 * the two can never disagree about the scale.
			 *
			 * The defaults are what portal.css hard-coded before these options existed
			 * (a 78% scrim, no blur, cards at 45% transparency), so a configuration
			 * that predates them keeps rendering exactly as before.
			 *
			 * `rmempty` is deliberately left at its default (true) and must not be
			 * set to false here. RangeSliderValue.formvalue() returns null for a
			 * value that equals `default` - that is how it elides a redundant key
			 * on save - and the form then either removes the option or, when
			 * rmempty is false, refuses the save with "Option ... must not be
			 * empty." A freshly installed package ships exactly those defaults, so
			 * a plain Save-and-Apply without touching a single slider trips it on
			 * all three. Leaving rmempty alone means the backend's percent() fills
			 * the value back in, which is the same number anyway.
			 */
			o = s.option(form.RangeSliderValue, 'bg_veil', _('Background veil'),
				_('How strongly a background image is dimmed, in percent. 0 leaves the ' +
				  'photo as it is, 100 hides it behind a solid scrim. Only applies when a ' +
				  'background image is set.'));
			o.min = 0;
			o.max = 100;
			o.step = 1;
			o.default = 78;
			o.calcunits = '%';

			o = s.option(form.RangeSliderValue, 'bg_blur', _('Background blur'),
				_('Frosted-glass blur applied to a background image, in percent of the ' +
				  'maximum (20 px). 0 keeps the photo sharp.'));
			o.min = 0;
			o.max = 100;
			o.step = 1;
			o.default = 0;
			o.calcunits = '%';

			o = s.option(form.RangeSliderValue, 'card_transparency',
				_('Bookmark transparency'),
				_('Transparency of the bookmark cards, in percent. 0 makes them solid, ' +
				  '100 lets the background shine through completely; the text stays ' +
				  'readable either way.'));
			o.min = 0;
			o.max = 100;
			o.step = 1;
			o.default = 45;
			o.calcunits = '%';

			return m.render().then(function(mapNode) {
				/* The panel starts out empty, fill it once the map is built. */
				return status.refresh().then(function() {
					return E('div', {}, [ status, mapNode ]);
				});
			});
		}.bind(this));
	}
});
