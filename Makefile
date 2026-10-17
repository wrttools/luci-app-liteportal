#
# Copyright (C) 2026 cocolight
#
# This is free software, licensed under the GNU General Public License v2.
# See /LICENSE for more information.
#

include $(TOPDIR)/rules.mk

PKG_VERSION:=4.0.0
PKG_RELEASE:=1

# The package name must not be left to luci.mk's `notdir $(CURDIR)`: make
# resolves the SDK's package/ symlink, so CURDIR would name this checkout
# directory (luci-app-liteportal) rather than the package we ship. Pin it here -
# luci.mk picks a caller-provided LUCI_NAME up through its `?=` assignment.
LUCI_NAME:=luci-app-liteportal

# luci.mk derives PKG_PO_VERSION from git and, without a git checkout, from the
# newest file mtime in the package directory. That changes on every rebuild and
# leaves stale luci-i18n-* artefacts behind, so pin it to the package version.
PKG_PO_VERSION:=$(PKG_VERSION)

PKG_MAINTAINER:=cocolight
PKG_LICENSE:=GPL-2.0-only
PKG_LICENSE_FILES:=LICENSE

LUCI_TITLE:=Portal - static HTML dashboard
LUCI_DESCRIPTION:=Publishes a static HTML navigation portal as a sub-path of \
	the router's existing uhttpd. Bookmarks, icons and the background are \
	managed through LuCI and persisted in uci.
LUCI_DEPENDS:=+luci-base +uhttpd +ucode +ucode-mod-fs +ucode-mod-uci +rpcd-mod-ucode
LUCI_PKGARCH:=all
LUCI_URL:=https://github.com/wrttools/luci-app-liteportal

# package.mk looks up PKG_LICENSE_FILES inside PKG_BUILD_DIR, while luci.mk
# only stages luasrc/ucode/htdocs/root/src there - copy the license ourselves.
# luci.mk copies ./root into $(PKG_BUILD_DIR) right before this hook runs and
# installs it with `cp -pR`, i.e. with whatever mode the file has in the
# working tree. The init script has to be executable, and a checkout that lost
# the bit (Windows tooling, a copy, core.filemode=false hiding the change)
# would otherwise ship a package whose service can never start.
define Build/Prepare/luci-app-liteportal
	$(INSTALL_DIR) $(PKG_BUILD_DIR)
	$(CP) ./LICENSE $(PKG_BUILD_DIR)/LICENSE
	chmod 0755 $(PKG_BUILD_DIR)/root/etc/init.d/liteportal
endef

define Package/luci-app-liteportal/conffiles
/etc/config/liteportal
endef

define Package/luci-app-liteportal/postinst
#!/bin/sh
# $${IPKG_INSTROOT} is set by opkg, $${PKG_INSTROOT} by apk-tools.
[ -z "$${IPKG_INSTROOT}$${PKG_INSTROOT}" ] || exit 0

# Adopt the trees left by earlier releases. Everything carried over here is user
# data - bookmarks, uploaded icons and backgrounds, appearance and search
# settings - so it is moved, and only onto a location that is still empty. A
# merge into a tree already in use is never attempted.
#
# 3.x -> 4.0.0 renamed the configuration file, the served tree and the ubus
# object at once, so a device coming from 3.0.2 keeps nothing unless it is
# carried over at this point. Two details decide the shape of the code:
#
#   * The configuration cannot use the "is the new location still empty" test
#     the asset moves below use - apk has already unpacked this package's
#     default configuration to /etc/config/liteportal by the time this script
#     runs. It marks a configuration it did NOT overwrite as .apk-new, so that
#     marker is what tells a user's own liteportal configuration apart from the
#     default just dropped there.
#   * The asset moves run before the mkdir below, because a pre-created
#     /www/liteportal would defeat their emptiness test.
#
# The old package is normally still installed when this runs; the release notes
# have the user remove it afterwards, not before.
if [ -f /etc/config/portal ] && [ ! -f /etc/config/liteportal.apk-new ]; then
	mv -f /etc/config/portal /etc/config/liteportal
fi
[ -d /www/portal ] && [ ! -d /www/liteportal ] && mv /www/portal /www/liteportal

# 2.0.0-r23 -> 3.0.0 kept its runtime tree under /etc/portal/www. Same rule, one
# layout further back.
for sub in icons bg; do
	if [ -d "/etc/portal/www/$$sub" ] && [ ! -d "/www/liteportal/$$sub" ]; then
		mv "/etc/portal/www/$$sub" "/www/liteportal/$$sub" 2>/dev/null
	fi
done
rm -rf /etc/portal

# The page is handed out by the main uhttpd out of its own document root, so
# that is where it has to live.
mkdir -p /www/liteportal

# A 3.x package may still be installed alongside this one; its service would go
# on republishing the page under the old name. Stopped and disabled here, but
# its files are left to the package manager - removing them would break that
# package's own prerm.
if [ -x /etc/init.d/portal ]; then
	/etc/init.d/portal stop 2>/dev/null
	/etc/init.d/portal disable 2>/dev/null
fi

# The template files are installed by /etc/init.d/liteportal start below, which also
# bakes the first links.json - so the list of files to publish lives in exactly
# one place.

# Let rpcd pick up the new ucode plugin, then bake the initial links.json.
# If the reload did not rescan the plugin directory the ubus object stays
# missing and every luci.liteportal call fails with "Object not found", so fall back
# to a full restart before generating.
/etc/init.d/rpcd reload 2>/dev/null
ubus list 2>/dev/null | grep -q '^luci\.liteportal$$' || /etc/init.d/rpcd restart 2>/dev/null
sleep 1

# Reported instead of discarded: a silent failure here leaves the portal
# with no bookmarks on it and nothing in the log to explain why.
out=$$(ubus call luci.liteportal generate 2>&1); \
printf '%s' "$$out" | grep -q '"ok"[[:space:]]*:[[:space:]]*true' \
	|| { echo "luci-app-liteportal: links.json not generated: $$out" >&2; \
	     logger -t liteportal "links.json not generated during install: $$out"; }

# root/ is copied verbatim by the build system, so the init script carries
# whatever mode the working tree had. A non-executable script fails both calls
# below and the portal never comes up, so force the mode here as well - that
# also repairs devices updated from a package built with a 0644 script.
chmod 0755 /etc/init.d/liteportal 2>/dev/null

if ! /etc/init.d/liteportal enable; then \
	echo "luci-app-liteportal: failed to enable the portal service" >&2; \
	logger -t liteportal "failed to enable the portal service"; \
fi
if ! /etc/init.d/liteportal start; then \
	echo "luci-app-liteportal: failed to start the portal service" >&2; \
	logger -t liteportal "failed to start the portal service"; \
fi

rm -f /tmp/luci-indexcache.*
rm -rf /tmp/luci-modulecache/

exit 0
endef

define Package/luci-app-liteportal/prerm
#!/bin/sh
[ -z "$${IPKG_INSTROOT}$${PKG_INSTROOT}" ] || exit 0

# Same guard as in postinst: a package built before the mode was fixed ships a
# 0644 init script. Here the consequence is that the service would stay enabled
# after the page it publishes is gone, so the mode is forced before the calls
# below rather than after them.
chmod 0755 /etc/init.d/liteportal 2>/dev/null

if ! /etc/init.d/liteportal stop; then \
	echo "luci-app-liteportal: failed to stop the portal service" >&2; \
	logger -t liteportal "failed to stop the portal service"; \
fi
if ! /etc/init.d/liteportal disable; then \
	echo "luci-app-liteportal: failed to disable the portal service" >&2; \
	logger -t liteportal "failed to disable the portal service"; \
fi

# Only the portal's own sub-directory: /www is shared with LuCI and the rest of
# the web server, and /www/liteportal holds the files the user uploaded into it.
rm -rf /www/liteportal

# /etc/config/liteportal is a conffile and its removal is left to the package
# manager, so that a modified configuration survives a reinstall.

exit 0
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
