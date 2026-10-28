"""Publishing rejects malformed tables before any complete answer is stored."""
import sys
from pathlib import Path
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from markdown_tables import cells,validate_published_tables

class MarkdownTableTests(unittest.TestCase):
    def test_correct_tables_and_escaped_pipes(self):
        text='| 类别 | 次数 | 备注 |\n|:---|---:|---|\n| A\\|B | {{count}} | `x\\|y` |'
        validate_published_tables(text)
        self.assertEqual(len(cells(text.splitlines()[-1])),3)
    def test_missing_and_extra_delimiter_columns_rejected(self):
        for separator in ['|---|---|','|---|---|---|---|']:
            with self.subTest(separator=separator),self.assertRaisesRegex(ValueError,'分隔行'):
                validate_published_tables('| A | B | C |\n'+separator+'\n| x | y | z |')
    def test_incomplete_and_extra_body_cells_rejected(self):
        for row in ['| x | y |','| x | y | z | w |']:
            with self.subTest(row=row),self.assertRaisesRegex(ValueError,'数据行'):
                validate_published_tables('| A | B | C |\n|---|---|---|\n'+row)
    def test_fences_indented_code_and_raw_pre_are_literal(self):
        broken='| A | B | C |\n|---|---|\n| x | y | z |'
        for text in ['```markdown\n'+broken+'\n```','~~~~\n'+broken+'\n~~~~','<pre>\n'+broken+'\n</pre>','\n'.join('    '+line for line in broken.splitlines())]:
            with self.subTest(text=text):validate_published_tables(text)
    def test_plain_prose_setext_and_literal_empty_cells(self):
        for text in ['ordinary | text\n---','| A | B | C |\n|---|---|---|\n| x | | z |','## Header\n\nA conclusion.']:
            with self.subTest(text=text):validate_published_tables(text)

if __name__=='__main__':unittest.main()
