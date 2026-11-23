import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Button, Card, Form, Input, Typography } from "antd";
import { LockOutlined, UserOutlined, VideoCameraOutlined } from "@ant-design/icons";

import { ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";

interface LoginForm {
  username: string;
  password: string;
}

export default function LoginPage() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onFinish = async ({ username, password }: LoginForm) => {
    setSubmitting(true);
    setError(null);
    try {
      await login(username.trim(), password);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("errors.network"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#eef2f7", padding: 16 }}>
      <Card style={{ width: "100%", maxWidth: 400 }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <VideoCameraOutlined style={{ fontSize: 48, color: "#1d4ed8" }} />
          <Typography.Title level={3} style={{ marginTop: 12 }}>
            {t("app.title")}
          </Typography.Title>
        </div>

        {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}

        <Form<LoginForm> layout="vertical" size="large" onFinish={onFinish} requiredMark={false}>
          <Form.Item
            name="username"
            label={t("login.username")}
            rules={[{ required: true, message: t("login.required", { field: t("login.username") }) }]}
          >
            <Input prefix={<UserOutlined />} autoComplete="username" autoFocus />
          </Form.Item>
          <Form.Item
            name="password"
            label={t("login.password")}
            rules={[{ required: true, message: t("login.required", { field: t("login.password") }) }]}
          >
            <Input.Password prefix={<LockOutlined />} autoComplete="current-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={submitting}>
            {t("login.submit")}
          </Button>
        </Form>
      </Card>
    </div>
  );
}
