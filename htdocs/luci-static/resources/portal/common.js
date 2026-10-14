'use strict';
'require rpc';
'require ui';
'require uci';
'require form';
'require baseclass';

/*
 * Shared helpers for the portal views. Loaded as
 *
 *     'require portal.common as common';
 *
 * The `as common` part only picks the variable name - the module system derives
 * it from the last path segment otherwise.
 *
 * This module MUST return a class, not a plain object. LuCI's require() wraps
 * the factory output in a class check (`Class.isSubclass()`) and then does
 * `new` on it, so returning an object literal fails with
 *
 *     TypeError: "portal.common" factory yields invalid constructor
 *
 * The rpc handles stay at the top level on purpose: they are created once when
 * the file is evaluated, and the methods below close over them. Putting them
 * into the extend object would rebuild them on every instantiation.
 */

/*
 * `reject: true` is not optional here: it is what turns a rejected ubus call
 * into a rejected promise instead of a result of 2. See run_rpc() below.
 */
const callStatus = rpc.declare({
	object: 'luci.portal',
	method: 'status',
	reject: true
});

const callScan = rpc.declare({
	object: 'luci.portal',
	method: 'scan',
	params: [ 'ports' ],
	reject: true
});

/*
 * What a failed render() leaves on the page instead of throwing.
 *
 * The stack goes in a <pre> rather than into a notification: LuCI's own error
 * path shows a modal that the SPA router then tears down with the aborted
 * stage, so a message delivered that way is gone before it can be read.
 */
function render_error_block(err) {
	return E('div', { class: 'alert-message error' }, [
		E('p', {}, _('Error')),
		E('pre', { style: 'white-space:pre-wrap' }, String((err && err.message) || err))
	]);
}

/*
 * Discover the locally reachable services and add the ones that are not
 * bookmarked yet as disabled entries. The changes are only staged here - the
 * user still has to tick the ones they want and apply, which is what the button
 * caption promises.
 *
 * The backend sorts the ports into three buckets rather than guessing:
 * services a browser cannot open (ssh, dns, a VPN) are dropped, known web
 * services are added, and everything else is reported as unrecognised. A port
 * number carries no protocol information - 7890 may be a proxy or an arbitrary
 * TCP service, 1053 is mDNS - so anything else would be a coin flip, and a
 * wrong bookmark is worse than an extra click.
 */
function scan_services() {
	return callScan().then(function(result) {
		const entries = (result && result.ports) || [];
		const host = (result && result.lan_ip) || window.location.hostname;
		let added = 0;
		let unknown = [];

		const add = function(entry) {
			const url = 'http://' + host + ':' + entry.port;

			const known = uci.sections('portal', 'link').some(function(section) {
				return uci.get('portal', section['.name'], 'url') === url;
			});

			if (known)
				return;

			const sid = uci.add('portal', 'link');

			uci.set('portal', sid, 'name', entry.svc || _('Service %d').format(entry.port));
			uci.set('portal', sid, 'url', url);
			uci.set('portal', sid, 'icon_url', '🔌');
			uci.set('portal', sid, 'enabled', '0');
			added++;
		};

		entries.forEach(function(entry) {
			if (entry.web === true)
				add(entry);
			else if (entry.web === 'unknown')
				unknown.push(entry);
		});

		if (!added)
			return { added: 0, unknown: unknown };

		return uci.save().then(function() {
			return { added: added, unknown: unknown };
		});
	});
}

/*
 * Ask what to do about the ports the scan could not classify.
 *
 * Dropping them silently would lose a service the user runs on an unusual
 * port; adding them automatically would put ssh and mDNS on the page. So they
 * are listed and the choice is explicit, and even when accepted they land
 * disabled like everything else the scan finds.
 *
 * `self` is the common instance: run_rpc() is a prototype method, so this
 * module-level function cannot reach it on its own.
 */
function confirm_unknown(self, result) {
	const unknown = (result && result.unknown) || [];
	const host = (result && result.lan_ip) || window.location.hostname;
	const list = unknown
		.map(function(entry) { return String(entry.port); })
		.join(', ');

	ui.showModal(_('Unrecognised ports'), [
		E('p', {}, _('These listening ports could not be classified: %s').format(list)),
		E('p', { class: 'cbi-value-description' },
			_('A port number does not say which protocol is spoken on it, so they ' +
			  'were neither added nor dropped automatically.')),
		E('div', { class: 'right' }, [
			E('button', {
				class: 'btn',
				click: function() { ui.hideModal(); }
			}, _('Ignore')),
			' ',
			E('button', {
				class: 'btn cbi-button cbi-button-action',
				click: function() {
					ui.hideModal();

					return self.run_rpc(function() {
						let added = 0;

						unknown.forEach(function(entry) {
							const url = 'http://' + host + ':' + entry.port;

							const known = uci.sections('portal', 'link').some(function(section) {
								return uci.get('portal', section['.name'], 'url') === url;
							});

							if (known)
								return;

							const sid = uci.add('portal', 'link');

							uci.set('portal', sid, 'name', entry.svc || _('Service %d').format(entry.port));
							uci.set('portal', sid, 'url', url);
							uci.set('portal', sid, 'icon_url', '🔌');
							uci.set('portal', sid, 'enabled', '0');
							added++;
						});

						return uci.save().then(function() { return { added: added }; });
					}, function(res) {
						return _('Added %d disabled bookmark(s) - tick the ones you want and apply.')
							.format((res && res.added) || 0);
					}).then(function(res) {
							if (res && res.added)
								window.setTimeout(function() { window.location.reload(); }, 1500);
						});
				}
			}, _('Add as disabled bookmarks'))
		])
	]);
}

return baseclass.extend(/** @lends LuCI.portal.common.prototype */ {

	/*
	 * Show a notification, replacing the previous one this app put up.
	 *
	 * ui.addNotification() inserts a fresh banner at the top of #maincontent and
	 * never takes an old one down, so repeated clicks on Save or "Select all"
	 * stack the banners up and the page grows taller with every click. Holding
	 * on to the node the previous call returned and removing it first leaves at
	 * most one banner on screen, which is what makes the message readable
	 * instead of a wall of identical lines.
	 */
	notify(title, children, type) {
		if (this._notification != null && this._notification.parentNode != null)
			this._notification.parentNode.removeChild(this._notification);

		this._notification = ui.addNotification(title, children, type);

		return this._notification;
	},

	/*
	 * Run an action that talks to the backend, with visible feedback either way.
	 *
	 * LuCI does not do this for us: ui.createHandlerFn() wraps a button handler in
	 * Promise.resolve(...).finally(...) and never attaches a .catch(), so a rejected
	 * promise ends up in the console while the user sees nothing at all. Every
	 * button that calls the backend goes through here, so a failure always surfaces
	 * as a notification instead of a click that appears to do nothing.
	 *
	 * okMsg is a string, or a function(result) returning one; it is skipped when the
	 * action resolves to null.
	 *
	 * Failures arrive in two shapes and both have to be caught here:
	 *
	 *  - an ubus level error (unknown method, missing ACL entry, an argument the
	 *    method policy does not allow) never reaches the action at all. LuCI
	 *    resolves the numeric status as the call result unless the rpc.declare()
	 *    for that method sets `reject: true`, so every declaration in this app
	 *    carries it - without it a failed call is indistinguishable from success;
	 *  - an application level failure (a name that is already taken, a directory
	 *    that cannot be written) resolves normally with { ok: false, error: ... },
	 *    which is rethrown just below.
	 */
	run_rpc(action, okMsg) {
		return Promise.resolve()
			.then(action)
			.then((res) => {
				/*
				 * The backend reports failure by resolving with { ok: false, error:
				 * ... } instead of rejecting, so a bare null check would read it as
				 * success. Rethrow it so the catch below reports the error instead
				 * of a bogus success notification.
				 */
				if (res != null && res.ok === false)
					throw new Error(res.error);

				if (okMsg != null && res != null)
					this.notify(null, E('p', {},
						(typeof(okMsg) === 'function') ? okMsg(res) : okMsg), 'info');

				return res;
			})
			.catch((err) => {
				/* 'error' is defined by both the bootstrap and the argon themes. */
				this.notify(_('Error'),
					E('p', {}, _('Operation failed: %s').format((err && err.message) || err)),
					'error');

				return null;
			});
	},

	/*
	 * Run a view's render() body so that a failure ends the page instead of the
	 * session.
	 *
	 * Why this is needed: LuCI's View.__init__ is
	 *   .then(load).then(render).then(paint).catch(LuCI.prototype.error)
	 * and error() re-throws after showing its notification. Under
	 * luci-theme-footstrap's SPA router that is expensive, because it
	 * serializes navigations (`const previous = _inflight`): a view that never
	 * paints keeps every later click queued until the 15000 ms
	 * RENDER_TIMEOUT expires, and history.pushState has already moved the
	 * address bar by then - so the URL and the page disagree. Catching here
	 * returns a real DOM node, the view paints, the queue drains immediately
	 * and the next click navigates at once.
	 *
	 * The asynchronous half is not optional: general.js returns a promise
	 * (form.Map#render), so a plain try/catch would let a rejection escape
	 * through exactly the path this is meant to close.
	 *
	 * `context` is the view instance - render() runs with `this` bound to it,
	 * and the body still needs that.
	 */
	render_safe(fn, context) {
		let res;

		try {
			res = fn.call(context);
		}
		catch (err) {
			return render_error_block(err);
		}

		return Promise.resolve(res).catch(render_error_block);
	},

	badge(text, ok) {
		return E('span', {
			style: 'display:inline-block;padding:1px 8px;border-radius:9px;color:#fff;' +
				'font-size:90%;white-space:nowrap;background:' + (ok ? '#2e7d32' : '#c62828')
		}, text);
	},

	/*
	 * A neutral badge for states that are neither good nor bad. A portal the user
	 * deliberately switched off is not a failure, so it must not be painted red.
	 */
	muted_badge(text) {
		return E('span', {
			style: 'display:inline-block;padding:1px 8px;border-radius:9px;color:#fff;' +
				'font-size:90%;white-space:nowrap;background:#607d8b'
		}, text);
	},

	status_row(label, value) {
		return E('tr', { class: 'tr' }, [
			E('td', { class: 'td left', style: 'width:32%' }, label),
			E('td', { class: 'td left' }, value)
		]);
	},

	/*
	 * Why the portal cannot be reached, in the words of whatever is actually
	 * wrong.
	 *
	 * The page is served by the main uhttpd, so "the portal is down" is never a
	 * single fact: either the files are not in place, or the server that should
	 * hand them out is not listening. Those have two different fixes, which is
	 * exactly why the backend reports them separately instead of folding them
	 * into one boolean.
	 */
	unreachable_reason(st) {
		if (!st.published)
			return _('The page files are not in place. Press "Save & Apply" to publish it.');

		if (!st.server_listening)
			return _('The main web server (uhttpd) is not listening on any of its ports, so nothing can serve the page.');

		return _('The page cannot be reached.');
	},

	/*
	 * The status panel. It answers one question - can the portal be reached -
	 * and reports the two conditions behind it rather than a process id: there
	 * is no portal daemon any more, the page is handed out by the main uhttpd.
	 *
	 * `enabled` stays a separate axis: when it is false the page is supposed to
	 * be absent, which is why the failure hint is replaced by one pointing at
	 * the switch - a portal the user switched off is not a fault.
	 */
	status_view(st) {
		if (!st)
			return [ E('em', {}, _('Service state unknown.')) ];

		const on = (st.enabled !== false);

		/*
		 * Composed from the origin this page was loaded from, not from a stored
		 * address: LuCI and the portal are served by the same uhttpd, so the
		 * origin is by construction the one that reaches it - whichever host,
		 * port or scheme the admin browsed in on.
		 */
		const url = window.location.origin + (st.path || '/portal/');

		const nodes = [
			E('table', { class: 'table' }, [
				this.status_row(_('Reachable'), on
					? [
						this.badge(st.reachable ? _('Yes') : _('No'), st.reachable),
						st.reachable ? '' : ' ' + this.unreachable_reason(st)
					]
					: [ this.muted_badge(_('Disabled')) ]),
				this.status_row(_('Address'),
					E('a', { href: url, target: '_blank', rel: 'noopener' }, url)),
				this.status_row(_('Bookmarks'), st.generated
					? _('%d baked into links.json').format(st.links)
					: E('em', {}, _('links.json has not been generated yet')))
			])
		];

		if (!on) {
			nodes.push(E('p', { class: 'alert-message' }, [
				_('The portal is switched off. Turn on "Enable portal" above, then press "Save & Apply" to publish it.')
			]));
		}
		else if (!st.reachable) {
			nodes.push(E('p', { class: 'alert-message warning' }, [
				this.unreachable_reason(st)
			]));
		}

		return nodes;
	},

	status_panel() {
		const body = E('div', { style: 'margin-bottom:.6em' }, E('em', {}, _('Querying…')));

		// Bound to the instance so that the helpers below resolve through the
		// prototype, exactly like a method call would.
		const self = this;

		function refresh() {
			body.replaceChildren(E('em', {}, _('Querying…')));

			return callStatus().then(function(st) {
				body.replaceChildren(...self.status_view(st));
			}).catch(function(err) {
				body.replaceChildren(E('em', {},
					_('Status query failed: %s').format((err && err.message) || err)));
			});
		}

		const node = E('div', { class: 'cbi-section' }, [
			E('h3', {}, _('Service status')),
			body,
			E('div', { style: 'margin-top:.8em' }, [
				E('button', {
					class: 'btn cbi-button cbi-button-action',
					click: function(ev) {
						ev.preventDefault();
						return refresh();
					}
				}, _('Refresh')),
				' ',
				E('span', { class: 'cbi-value-description' },
					_('Re-reads the published state, it does not change the configuration.'))
			])
		]);

		node.refresh = refresh;

		return node;
	},

	/*
	 * The Maintenance section: scan the router for locally reachable services.
	 *
	 * It used to carry a second button that regenerated links.json on demand.
	 * That is gone (ROADMAP #10): a configuration change already runs
	 * `/etc/init.d/portal reload`, and procd_add_reload_trigger is registered
	 * on the service, so "Save & Apply" re-bakes the page whether or not
	 * anything about it changed. The button was a second path to something the
	 * normal save already does - and a misleading one, since pressing it
	 * republishes without fixing whatever the user came to change.
	 *
	 * It lives here rather than in either view because it is needed by both,
	 * and a copy per page would drift - the scan in particular has a rule about
	 * which ports may be added without asking, and two copies of that rule are
	 * two chances to get it wrong. The caller decides where it goes; the Bookmarks
	 * page puts it above the list, since the scan writes bookmarks.
	 *
	 * `status` is the panel returned by status_panel(). Nothing in the section
	 * refreshes it at the moment - the Bookmarks page passes null and the
	 * Bookmarks page is the only caller - but it stays a parameter because a
	 * scan that republishes would want it, and status_panel() carries its own
	 * refresh button for the general case.
	 */
	maintenance_section: function(m, status) {
		const s = m.section(form.TypedSection, 'portal', _('Maintenance'));

		s.anonymous = true;
		s.addremove = false;

		let o = s.option(form.Button, '_scan', _('Discovery'));
		o.inputtitle = _('Scan local services & add (disabled)');
		o.inputstyle = 'action';
		o.onclick = function() {
			return this.run_rpc(scan_services, function(result) {
				const added = (result && result.added) || 0;
				const unknown = (result && result.unknown) || [];

				if (added && !unknown.length)
					return _('Added %d disabled bookmark(s) - tick the ones you want and apply.')
						.format(added);

				if (added && unknown.length)
					return _('Added %d bookmark(s); %d port(s) were not recognised.')
						.format(added, unknown.length);

				if (!added && !unknown.length)
					return _('No new local services found.');

				return null;
			}.bind(this)).then(function(result) {
				const unknown = (result && result.unknown) || [];

				/*
				 * Unrecognised ports are not added and not forgotten: offer
				 * them explicitly, so the decision stays with the user
				 * instead of being made by a guess in either direction.
				 */
				if (unknown.length)
					return confirm_unknown(self, result);

				/*
				 * The staged bookmarks only become visible on the Bookmarks
				 * page, so redraw it - but give the notification a moment
				 * first, a reload would wipe it instantly.
				 */
				if (result && result.added)
					window.setTimeout(function() { window.location.reload(); }, 1500);

				return result;
			});
		}.bind(this);

		return s;
	},

	callStatus: callStatus,
	callScan: callScan
});
