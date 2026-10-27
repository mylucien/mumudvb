#
# Copyright (C) 2026
#
# This is free software, licensed under the Apache License, Version 2.0 .
#

include $(TOPDIR)/rules.mk

LUCI_TITLE:=LuCI app for MuMuDVB (DVB/ATSC -> IPTV)
LUCI_DESCRIPTION:=Configure and control the MuMuDVB streaming daemon.
LUCI_DEPENDS:=+luci-base +mumudvb
LUCI_PKGARCH:=all

PKG_NAME:=luci-app-mumudvb
PKG_VERSION:=1.0.0
PKG_RELEASE:=1
PKG_LICENSE:=Apache-2.0
PKG_MAINTAINER:=

include ../../luci.mk

# call BuildPackage - OpenWrt buildroot signature
$(eval $(call BuildPackage,luci-app-mumudvb))
