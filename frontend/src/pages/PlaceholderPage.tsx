import { useTranslation } from "react-i18next";
import { Empty } from "antd";

export default function PlaceholderPage({ phase }: { phase: string }) {
  const { t } = useTranslation();
  return <Empty style={{ marginTop: 120 }} description={t("placeholder", { phase })} />;
}
