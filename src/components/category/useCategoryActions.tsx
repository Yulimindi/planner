import { useNavigate } from 'react-router-dom'
import { useFeedback } from '../ui/Feedback'
import { countCategoryItems, deleteCategory, updateCategory } from '../../db/repo'
import type { Category } from '../../db/types'

export function useCategoryActions() {
  const { confirm, run } = useFeedback()
  const navigate = useNavigate()

  const archive = async (cat: Category) => {
    await run(() => updateCategory(cat.id, { archived: true }), `"${cat.name}"을(를) 보관함으로 옮겼어요.`)
  }

  const restore = async (cat: Category) => {
    await run(() => updateCategory(cat.id, { archived: false }), `"${cat.name}"을(를) 복원했어요.`)
  }

  const remove = async (cat: Category, redirect = false) => {
    const count = await countCategoryItems(cat)
    const ok = await confirm({
      title: '카테고리를 삭제할까요?',
      message: (
        <>
          <b className="text-ink">{cat.name}</b> 카테고리를 삭제하면
          {count > 0 ? <> 안에 저장된 <b className="text-danger">{count}개의 항목</b>도</> : null} 함께 영구적으로 삭제되며 되돌릴 수 없어요.
          <br />
          지금 필요 없는 것이라면 삭제 대신 <b className="text-ink">보관</b>을 이용할 수 있어요.
        </>
      ),
      confirmText: '영구 삭제',
      danger: true,
    })
    if (!ok) return false
    const done = await run(async () => {
      await deleteCategory(cat.id)
      return true
    }, '카테고리를 삭제했어요.')
    if (done && redirect) navigate('/')
    return !!done
  }

  return { archive, restore, remove }
}
