import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button, Layout, Menu, Space, Typography } from "antd";
import {
  AlertOutlined,
  HistoryOutlined,
  HddOutlined,
  LogoutOutlined,
  TeamOutlined,
  VideoCameraOutlined,
} from "@ant-design/icons";

import { useAuth } from "../auth/AuthContext";

export default function AppLayout() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isAdmin = user?.role === "admin";

  const items = [
    { key: "/live", icon: <VideoCameraOutlined />, label: t("menu.live") },
    { key: "/playback", icon: <HistoryOutlined />, label: t("menu.playback") },
    { key: "/alerts", icon: <AlertOutlined />, label: t("menu.alerts") },
    ...(isAdmin
      ? [
          { type: "divider" as const },
          { key: "/devices", icon: <HddOutlined />, label: t("menu.devices") },
          { key: "/users", icon: <TeamOutlined />, label: t("menu.users") },
        ]
      : []),
  ];

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Layout.Sider breakpoint="lg" collapsedWidth={64} width={220} theme="dark">
        <div style={{ color: "#fff", padding: "20px 16px", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden" }}>
          <VideoCameraOutlined /> {t("app.title")}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[pathname]}
          items={items}
          onClick={({ key }) => navigate(key)}
        />
      </Layout.Sider>
      <Layout>
        <Layout.Header style={{ background: "#fff", display: "flex", justifyContent: "flex-end", paddingInline: 16 }}>
          <Space>
            <Typography.Text>
              {user?.full_name || user?.username} ({user && t(`role.${user.role}`)})
            </Typography.Text>
            <Button icon={<LogoutOutlined />} onClick={logout}>
              {t("menu.logout")}
            </Button>
          </Space>
        </Layout.Header>
        <Layout.Content style={{ padding: 16 }}>
          <Outlet />
        </Layout.Content>
      </Layout>
    </Layout>
  );
}
