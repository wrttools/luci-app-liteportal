#
# Copyright (C) 2026 cocolight
#
# This is free software, licensed under the GNU General Public License v2.
# See /LICENSE for more information.
#

include $(TOPDIR)/rules.mk

PKG_VERSION:=3.0.1
PKG_RELEASE:=5

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
LUCI_URL:=https://github.com/wrttools/luci-app-portal

# package.mk looks up PKG_LICENSE_FILES inside PKG_BUILD_DIR, while luci.mk
# only stages luasrc/ucode/htdocs/root/src there - copy the license ourselves.
# luci.mk copies ./root into $(PKG_BUILD_DIR) right before this hook runs and
# installs it with `cp -pR`, i.e. with whatever mode the file has in the
# working tree. The init script has to be executable, and a checkout that lost
# the bit (Windows tooling, a copy, core.filemode=false hiding the change)
# would otherwise ship a package whose service can never start.
define Build/Prepare/luci-app-portal
	$(INSTALL_DIR) $(PKG_BUILD_DIR)
	$(CP) ./LICENSE $(PKG_BUILD_DIR)/LICENSE
	chmod 0755 $(PKG_BUILD_DIR)/root/etc/init.d/portal
endef

define Package/luci-app-portal/conffiles
/etc/config/portal
endef

define Package/luci-app-portal/postinst
#!/bin/sh
# $${IPKG_INSTROOT} is set by opkg, $${PKG_INSTROOT} by apk-tools.
[ -z "$${IPKG_INSTROOT}$${PKG_INSTROOT}" ] || exit 0

# The page is handed out by the main uhttpd out of its own document root, so
# that is where it has to live.
mkdir -p /www/portal

# Adopt an installation made by 2.0.0-r23 or earlier, which kept its runtime
# tree under /etc/portal/www. The uploaded assets are user data: move a
# directory over only while the new location is still empty, and never merge
# into one that is already in use.
for sub in icons bg; do
	if [ -d "/etc/portal/www/$$sub" ] && [ ! -d "/www/portal/$$sub" ]; then
		mv "/etc/portal/www/$$sub" "/www/portal/$$sub" 2>/dev/null
	fi
done
rm -rf /etc/portal

# The template files are installed by /etc/init.d/portal start below, which also
# bakes the first links.json - so the list of files to publish lives in exactly
# one place.

# Let rpcd pick up the new ucode plugin, then bake the initial links.json.
# If the reload did not rescan the plugin directory the ubus object stays
# missing and every luci.portal call fails with "Object not found", so fall back
# to a full restart before generating.
/etc/init.d/rpcd reload 2>/dev/null
ubus list 2>/dev/null | grep -q '^luci\.portal$$' || /etc/init.d/rpcd restart 2>/dev/null
sleep 1

# Reported instead of discarded: a silent failure here leaves the portal
# with no bookmarks on it and nothing in the log to explain why.
out=$$(ubus call luci.portal generate 2>&1); \
printf '%s' "$$out" | grep -q '"ok"[[:space:]]*:[[:space:]]*true' \
	|| { echo "luci-app-portal: links.json not generated: $$out" >&2; \
	     logger -t portal "links.json not generated during install: $$out"; }

# root/ is copied verbatim by the build system, so the init script carries
# whatever mode the working tree had. A non-executable script fails both calls
# below and the portal never comes up, so force the mode here as well - that
# also repairs devices updated from a package built with a 0644 script.
chmod 0755 /etc/init.d/portal 2>/dev/null

if ! /etc/init.d/portal enable; then \
	echo "luci-app-portal: failed to enable the portal service" >&2; \
	logger -t portal "failed to enable the portal service"; \
fi
if ! /etc/init.d/portal start; then \
	echo "luci-app-portal: failed to start the portal service" >&2; \
	logger -t portal "failed to start the portal service"; \
fi

rm -f /tmp/luci-indexcache.*
rm -rf /tmp/luci-modulecache/

exit 0
endef

define Package/luci-app-portal/prerm
#!/bin/sh
[ -z "$${IPKG_INSTROOT}$${PKG_INSTROOT}" ] || exit 0

# Same guard as in postinst: a package built before the mode was fixed ships a
# 0644 init script. Here the consequence is that the service would stay enabled
# after the page it publishes is gone, so the mode is forced before the calls
# below rather than after them.
chmod 0755 /etc/init.d/portal 2>/dev/null

if ! /etc/init.d/portal stop; then \
	echo "luci-app-portal: failed to stop the portal service" >&2; \
	logger -t portal "failed to stop the portal service"; \
fi
if ! /etc/init.d/portal disable; then \
	echo "luci-app-portal: failed to disable the portal service" >&2; \
	logger -t portal "failed to disable the portal service"; \
fi

# Only the portal's own sub-directory: /www is shared with LuCI and the rest of
# the web server, and /www/portal holds the files the user uploaded into it.
rm -rf /www/portal

# /etc/config/portal is a conffile and its removal is left to the package
# manager, so that a modified configuration survives a reinstall.

exit 0
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
