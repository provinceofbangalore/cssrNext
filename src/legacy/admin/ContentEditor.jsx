import React, { useState } from 'react';
import { CKEditor } from '@ckeditor/ckeditor5-react';
import {
  ClassicEditor, Essentials, Paragraph, Heading, Bold, Italic, Link, List,
  BlockQuote, Table, TableToolbar, HorizontalLine, GeneralHtmlSupport
} from 'ckeditor5';
import 'ckeditor5/ckeditor5.css';

const config = {
  licenseKey: 'GPL',
  plugins: [Essentials, Paragraph, Heading, Bold, Italic, Link, List, BlockQuote, Table, TableToolbar, HorizontalLine, GeneralHtmlSupport],
  toolbar: ['undo', 'redo', '|', 'heading', '|', 'bold', 'italic', 'link', '|', 'bulletedList', 'numberedList', 'blockQuote', 'insertTable', 'horizontalLine'],
  heading: {
    options: [
      { model: 'paragraph', title: 'Paragraph', class: 'ck-heading_paragraph' },
      ...[1, 2, 3, 4].map(level => ({ model: `heading${level}`, view: `h${level}`, title: `Heading ${level}`, class: `ck-heading_heading${level}` }))
    ]
  },
  htmlSupport: { allow: [{ name: 'a', attributes: ['target', 'rel'] }] },
  table: { contentToolbar: ['tableColumn', 'tableRow', 'mergeTableCells'] }
};

export default function ContentEditor({ value, onChange, label }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return <>
      <div className="alert alert-warning" role="alert">The rich-text editor could not be loaded. You can edit the HTML below instead.</div>
      <textarea className="form-control code-editor" rows={11} aria-label={label} value={value} onChange={event => onChange(event.target.value)} />
    </>;
  }

  return <CKEditor
    editor={ClassicEditor}
    config={config}
    data={value}
    onReady={editor => {
      editor.editing.view.change(writer => writer.setAttribute('aria-label', label, editor.editing.view.document.getRoot()));
    }}
    onChange={(_, editor) => onChange(editor.getData())}
    onError={() => setFailed(true)}
  />;
}
