import type { Locale } from "@sdr-crm/i18n";

type Section = { title: string; text: string };

const OPERATOR = process.env.PD_OPERATOR_NAME || "CRM LLC";
const EMAIL = process.env.PD_OPERATOR_EMAIL || "privacy@example.com";

const POLICIES: Record<Locale, { sections: Section[] }> = {
  ru: {
    sections: [
      { title: "1. Общие положения", text: "Настоящая политика определяет порядок обработки персональных данных в соответствии с ФЗ-152." },
      { title: "2. Оператор", text: `Оператор: ${OPERATOR}. Контакт: ${EMAIL}.` },
      { title: "3. Данные", text: "Имя, телефон, e-mail, регион, комментарий — только то, что вы указываете в форме." },
      { title: "4. Цели", text: "Обратная связь, обработка заявок, ведение CRM, исполнение договора." },
      { title: "5. Права", text: `Вы вправе отозвать согласие через форму на сайте или запрос на ${EMAIL}.` },
    ],
  },
  en: {
    sections: [
      { title: "1. General", text: "This policy describes how we process personal data." },
      { title: "2. Operator", text: `Operator: ${OPERATOR}. Contact: ${EMAIL}.` },
      { title: "3. Data", text: "Name, phone, email, region, comment — only what you submit in forms." },
      { title: "4. Purposes", text: "Contact, lead processing, CRM, contract performance." },
      { title: "5. Rights", text: `You may withdraw consent via the site form or by emailing ${EMAIL}.` },
    ],
  },
  zh: {
    sections: [
      { title: "1. 总则", text: "本政策说明我们如何处理个人数据。" },
      { title: "2. 运营方", text: `运营方：${OPERATOR}。联系：${EMAIL}。` },
      { title: "3. 数据", text: "姓名、电话、电子邮件、地区、备注——仅限您在表单中提交的内容。" },
      { title: "4. 目的", text: "联系、房产匹配、CRM、合同履行。" },
      { title: "5. 权利", text: `您可通过网站表单或发送邮件至 ${EMAIL} 撤回同意。` },
    ],
  },
  fr: {
    sections: [
      { title: "1. Dispositions générales", text: "Cette politique décrit le traitement des données personnelles." },
      { title: "2. Opérateur", text: `Opérateur : ${OPERATOR}. Contact : ${EMAIL}.` },
      { title: "3. Données", text: "Nom, téléphone, e-mail, région, commentaire — uniquement ce que vous soumettez." },
      { title: "4. Finalités", text: "Contact, matching immobilier, CRM, exécution du contrat." },
      { title: "5. Droits", text: `Vous pouvez retirer votre consentement via le formulaire ou ${EMAIL}.` },
    ],
  },
  de: {
    sections: [
      { title: "1. Allgemeines", text: "Diese Richtlinie beschreibt die Verarbeitung personenbezogener Daten." },
      { title: "2. Betreiber", text: `Betreiber: ${OPERATOR}. Kontakt: ${EMAIL}.` },
      { title: "3. Daten", text: "Name, Telefon, E-Mail, Region, Kommentar — nur was Sie in Formularen angeben." },
      { title: "4. Zwecke", text: "Kontakt, Immobilienmatching, CRM, Vertragserfüllung." },
      { title: "5. Rechte", text: `Sie können die Einwilligung per Formular oder an ${EMAIL} widerrufen.` },
    ],
  },
};

export function renderPrivacyPolicy(locale: Locale) {
  const policy = POLICIES[locale] || POLICIES.ru;
  return {
    version: "1.0",
    updatedAt: "2026-06-20",
    operator: OPERATOR,
    operatorEmail: EMAIL,
    locale,
    sections: policy.sections,
  };
}
